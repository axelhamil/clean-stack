import type { SCIMManagedConnection, SCIMScope } from "@better-auth/scim";
import { type AppError, Option, Result, uuidv7 } from "@packages/ddd-kit";
import { EventTypes } from "@packages/events";
import { auth } from "../../auth";
import { findMemberOf, scimProvisionedMembers } from "../../auth-queries";
import { emitEvent } from "../event-emitter";
import type { IInstrumentation } from "../ports/instrumentation.port";
import type { IOutboxRepository } from "../ports/outbox.port";

export type ScimConnectionError = AppError<
  "SCIM_CONNECTION_NOT_FOUND" | "SCIM_CONNECTION_PROVIDER_FAILURE"
>;

export interface ScimConnectionView {
  connectionId: string;
  createdAt: Date;
  tokenExpiresAt: Option<Date>;
}

export interface IssuedScimToken {
  token: string;
  expiresAt: Date;
}

/**
 * Users only: the organization projection maps a directory's users to members and
 * reads no Group, so a token that could write Groups would grant a capability
 * nothing honours.
 */
const SCIM_SCOPES: SCIMScope[] = ["scim.users.read", "scim.users.write"];

/**
 * A managed SCIM credential must expire. A year matches the longest lifetime an
 * API token may have (`API_TOKEN_MAX_EXPIRY_DAYS` default) and is long enough that
 * rotating it is a yearly chore, not a recurring outage.
 */
const TOKEN_LIFETIME_MS = 365 * 24 * 60 * 60 * 1000;

/**
 * The organization's side of `@better-auth/scim`'s managed connections: the plugin
 * exposes them only as trusted server APIs (`auth.api.*SCIMManaged*`), and leaves
 * who may call them, and on behalf of which organization, to the application. Each
 * organization has at most one active connection, its provisioning domain is the
 * organization id, and the token shown to the owner is the only copy (the plugin
 * stores an HMAC of it).
 *
 * Lives in `shared/services/` for the same reason as `AdminActionService`: it
 * imports the BetterAuth singleton, which depends on the DI container, so a module
 * registration would close an import cycle. The route instantiates it from built
 * `di` bindings.
 *
 * Every write emits its event after the plugin committed. The plugin's own
 * transaction cannot carry an outbox row, so this is the same post-commit
 * guarantee as the rest of the BetterAuth bridge.
 */
export class ScimConnectionService {
  constructor(
    private readonly outbox: IOutboxRepository,
    private readonly instrumentation: IInstrumentation,
  ) {}

  async find(
    organizationId: string,
  ): Promise<Result<Option<ScimConnectionView>, ScimConnectionError>> {
    return this.run("find", async () => {
      const connection = await this.activeConnection(organizationId);
      if (!connection) return Result.ok(Option.none());

      const { credentials } = await auth.api.getSCIMManagedConnection({
        body: { connectionId: connection.connectionId, provisioningDomainId: organizationId },
      });
      const expiries = credentials
        .filter((credential) => credential.status === "active")
        .map((credential) => credential.expiresAt.getTime());

      return Result.ok(
        Option.some({
          connectionId: connection.connectionId,
          createdAt: connection.createdAt,
          tokenExpiresAt:
            expiries.length > 0 ? Option.some(new Date(Math.max(...expiries))) : Option.none(),
        }),
      );
    });
  }

  /**
   * Creates the organization's connection on first use; afterwards issues a new
   * token and revokes every other one, so the organization only ever holds the
   * token it was last shown (the contract the settings page promises).
   */
  async issueToken(input: {
    organizationId: string;
    actorUserId: string;
  }): Promise<Result<IssuedScimToken, ScimConnectionError>> {
    return this.run("issueToken", async () => {
      const { organizationId, actorUserId } = input;
      const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS);
      const connection = await this.activeConnection(organizationId);

      if (!connection) {
        const created = await auth.api.createSCIMManagedConnection({
          body: {
            creationRequestId: uuidv7(),
            provisioningDomainId: organizationId,
            actorId: actorUserId,
            scopes: SCIM_SCOPES,
            expiresAt,
          },
        });
        await this.emitConnectionEvent(
          EventTypes.SCIM_CONNECTION_CREATED,
          created.connection.connectionId,
          input,
        );
        return Result.ok({ token: created.token, expiresAt: created.credential.expiresAt });
      }

      const { connectionId } = connection;
      const rotated = await auth.api.rotateSCIMManagedCredential({
        body: {
          connectionId,
          provisioningDomainId: organizationId,
          actorId: actorUserId,
          scopes: SCIM_SCOPES,
          expiresAt,
        },
      });

      const { credentials } = await auth.api.getSCIMManagedConnection({
        body: { connectionId, provisioningDomainId: organizationId },
      });
      const superseded = credentials.filter(
        (credential) =>
          credential.status === "active" &&
          credential.credentialId !== rotated.credential.credentialId,
      );
      for (const { credentialId } of superseded) {
        await auth.api.revokeSCIMManagedCredential({
          body: {
            connectionId,
            provisioningDomainId: organizationId,
            credentialId,
            actorId: actorUserId,
          },
        });
      }

      await this.emitConnectionEvent(EventTypes.SCIM_CONNECTION_TOKEN_ROTATED, connectionId, input);
      return Result.ok({ token: rotated.token, expiresAt: rotated.credential.expiresAt });
    });
  }

  /**
   * Decommissions the organization's connection. The plugin reconciles every user
   * it provisioned, and the projection removes the memberships nothing else backs:
   * each one is reported as an `org.member.removed` by the owner who disconnected
   * the directory.
   */
  async disconnect(input: {
    organizationId: string;
    actorUserId: string;
  }): Promise<Result<void, ScimConnectionError>> {
    return this.run("disconnect", async () => {
      const { organizationId, actorUserId } = input;
      const connection = await this.activeConnection(organizationId);
      if (!connection) {
        return Result.fail({
          code: "SCIM_CONNECTION_NOT_FOUND",
          message: "This organization has no directory connection to disconnect.",
        });
      }

      const { connectionId } = connection;
      const provisioned = await scimProvisionedMembers(connectionId, organizationId);
      await auth.api.decommissionSCIMManagedConnection({
        body: { connectionId, provisioningDomainId: organizationId, actorId: actorUserId },
      });

      for (const { memberId, userId } of provisioned) {
        if (await findMemberOf(userId, organizationId)) continue;
        await emitEvent(
          this.outbox,
          EventTypes.ORG_MEMBER_REMOVED,
          "member",
          memberId,
          { organizationId, actorUserId, userId },
          { organizationId },
        );
      }

      await this.emitConnectionEvent(EventTypes.SCIM_CONNECTION_DELETED, connectionId, input);
      return Result.ok();
    });
  }

  private async activeConnection(
    organizationId: string,
  ): Promise<SCIMManagedConnection | undefined> {
    const { connections } = await auth.api.listSCIMManagedConnections({
      body: { provisioningDomainId: organizationId },
    });
    return connections.find((connection) => connection.status === "active");
  }

  private async emitConnectionEvent(
    eventType:
      | typeof EventTypes.SCIM_CONNECTION_CREATED
      | typeof EventTypes.SCIM_CONNECTION_TOKEN_ROTATED
      | typeof EventTypes.SCIM_CONNECTION_DELETED,
    connectionId: string,
    input: { organizationId: string; actorUserId: string },
  ): Promise<void> {
    await emitEvent(
      this.outbox,
      eventType,
      "scim_connection",
      connectionId,
      {
        actorUserId: input.actorUserId,
        organizationId: input.organizationId,
        providerId: connectionId,
      },
      { organizationId: input.organizationId },
    );
  }

  private async run<T>(
    method: string,
    body: () => Promise<Result<T, ScimConnectionError>>,
  ): Promise<Result<T, ScimConnectionError>> {
    return this.instrumentation.startSpan(
      { name: `ScimConnectionService > ${method}` },
      async () => {
        try {
          return await body();
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail({
            code: "SCIM_CONNECTION_PROVIDER_FAILURE",
            message: "The directory connection could not be updated. Try again in a moment.",
          });
        }
      },
    );
  }
}
