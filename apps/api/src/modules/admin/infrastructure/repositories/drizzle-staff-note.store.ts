import { type IInstrumentation, Option, Result } from "@packages/ddd-kit";
import {
  and,
  authSchema,
  desc,
  eq,
  isNull,
  multiTenantSchema,
  resolveExecutor,
  staffSchema,
} from "@packages/drizzle";
import { dbOperationFailure } from "../../../../shared/db-failure";
import type {
  IStaffNoteStore,
  NewStaffNote,
  StaffNoteRow,
  StaffNoteStoreError,
  StaffNoteSubject,
} from "../../application/ports/staff-note-store.port";

const { staffNote } = staffSchema;
const { user } = authSchema;
const { organization } = multiTenantSchema;
const failure = dbOperationFailure("ADMIN_NOTE_PROVIDER_FAILURE");
const dbAttrs = { "db.system.name": "postgresql" } as const;

function ofSubject(subject: StaffNoteSubject) {
  return eq(subject.type === "user" ? staffNote.userId : staffNote.organizationId, subject.id);
}

export class DrizzleStaffNoteStore implements IStaffNoteStore {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async list(
    subject: StaffNoteSubject,
    limit: number,
  ): Promise<Result<StaffNoteRow[], StaffNoteStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleStaffNoteStore > list" }, async () => {
      try {
        const query = exec
          .select({
            id: staffNote.id,
            authorName: user.name,
            authorEmail: user.email,
            body: staffNote.body,
            createdAt: staffNote.createdAt,
          })
          .from(staffNote)
          .leftJoin(user, eq(user.id, staffNote.authorId))
          .where(ofSubject(subject))
          .orderBy(desc(staffNote.createdAt), desc(staffNote.id))
          .limit(limit);
        const rows = await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok(
          rows.map(({ authorName, authorEmail, ...row }) => ({
            ...row,
            authorName: Option.fromNullable(authorName || authorEmail),
          })),
        );
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(failure("list staff notes"));
      }
    });
  }

  async lockSubject(subject: StaffNoteSubject): Promise<Result<boolean, StaffNoteStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan(
      { name: "DrizzleStaffNoteStore > lockSubject" },
      async () => {
        try {
          const query =
            subject.type === "user"
              ? exec
                  .select({ id: user.id })
                  .from(user)
                  .where(and(eq(user.id, subject.id), isNull(user.deletedAt)))
                  .for("share")
              : exec
                  .select({ id: organization.id })
                  .from(organization)
                  .where(eq(organization.id, subject.id))
                  .for("share");
          const rows = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
            () => query.execute(),
          );

          return Result.ok(rows.length > 0);
        } catch (err) {
          this.instrumentation.capture(err);
          return Result.fail(failure("lock staff note subject"));
        }
      },
    );
  }

  async insert(note: NewStaffNote): Promise<Result<void, StaffNoteStoreError>> {
    const exec = resolveExecutor();

    return this.instrumentation.startSpan({ name: "DrizzleStaffNoteStore > insert" }, async () => {
      try {
        const query = exec.insert(staffNote).values({
          id: note.id,
          userId: note.subject.type === "user" ? note.subject.id : null,
          organizationId: note.subject.type === "org" ? note.subject.id : null,
          authorId: note.authorId,
          body: note.body,
        });
        await this.instrumentation.startSpan(
          { name: query.toSQL().sql, op: "db.query", attributes: dbAttrs },
          () => query.execute(),
        );

        return Result.ok();
      } catch (err) {
        this.instrumentation.capture(err);
        return Result.fail(failure("insert staff note"));
      }
    });
  }
}
