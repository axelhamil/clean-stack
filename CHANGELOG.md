## [1.11.2](https://github.com/axelhamil/clean-stack/compare/v1.11.1...v1.11.2) (2026-05-05)

### Bug Fixes

* **app:** bind vite preview to 0.0.0.0 + dynamic port for railway ([6f3b37d](https://github.com/axelhamil/clean-stack/commit/6f3b37d70fde4b940e3254b6e531647bc8ade01b))

### Documentation

* **modules:** add commercial sheet with à la carte and tier pricing ([b256ca2](https://github.com/axelhamil/clean-stack/commit/b256ca29b1d50b29ef5d5d1ba4a94e06ee0f1873))
* **modules:** rebase prices to honest senior-dev tjm reality ([610100e](https://github.com/axelhamil/clean-stack/commit/610100e38176b162fb34d41b53ed89f2875db4d7))
* **modules:** reframe pricing as client-mission value, defer license model ([53a9f80](https://github.com/axelhamil/clean-stack/commit/53a9f8035f91ba4bcabd66eb0b14c2472bdda657))
* **roadmap:** add phase 0.4 observability stack + refocus phase d.1 ([8bcfbcf](https://github.com/axelhamil/clean-stack/commit/8bcfbcf7c15b1fe3508864b3236a9ce9d5c12a82))
* **roadmap:** expand phase 0.2 health probes to 2026 sota scope ([2de2749](https://github.com/axelhamil/clean-stack/commit/2de2749a2b5ccba9ece0109c3615c76918d65d42))

## [1.11.1](https://github.com/axelhamil/clean-stack/compare/v1.11.0...v1.11.1) (2026-05-04)

### ⚠ BREAKING CHANGES

* API src layout. `apps/api/src/{adapters,application,domain,
routes,di}` removed in favor of `src/{modules,shared}` + flat
`src/container.ts`. `apps/api/{common,scripts}` consolidated under
`src/shared`. `gdpr`→`rgpd` everywhere. Forks must rewrite imports and DI
registration (now `defineModule()` + `.addModule()`).
* **app:** import paths changed across apps/app/src/. Any
consumer of routes/, adapters/, common/, providers/, or pages/
sub-folders inside features must update to the new shared/ +
<feature>.route.tsx layout.

### Performance

* **app:** code-split routes via lazy components, wire devtools, add 5-min tutorial ([65b2234](https://github.com/axelhamil/clean-stack/commit/65b22346703e2ff810e555215b9837abffa4ab47))

### Refactor

* **app:** pivot to vertical-slice + code-based routing ([d596e9d](https://github.com/axelhamil/clean-stack/commit/d596e9d334a17cb37a9fdbd5c3f3fd8b102a6e3d))
* pivot api+app to vertical-slice modular monolith with audit-grade hygiene ([b8ddc4f](https://github.com/axelhamil/clean-stack/commit/b8ddc4f71edcd9913343a12f0dcdfecab7b0d6d4))

### Documentation

* document the 2-file route+page split, getrouteapi pattern, and devtools wiring ([4c40dcf](https://github.com/axelhamil/clean-stack/commit/4c40dcffa711d807ae87ebcbff9891b0ba0b8f9c))

## [1.11.0](https://github.com/axelhamil/clean-stack/compare/v1.10.0...v1.11.0) (2026-05-03)

### Features

* **access-control:** export org_roles tuple for runtime iteration ([b78a9db](https://github.com/axelhamil/clean-stack/commit/b78a9dbd83c51d453a036db598a766a967f65a22))
* **api:** add gdpr account deletion + data export with grace period sweep ([fd3b4b7](https://github.com/axelhamil/clean-stack/commit/fd3b4b7d74a6577033f3ba921b9cce90212d069f))
* **app:** add gdpr settings ui + legal data-rights page ([bfcc15d](https://github.com/axelhamil/clean-stack/commit/bfcc15d5155ff439c8b2c84955717b6203e1f93f))
* **ddd-kit:** add scopedrepository + reposcope primitive ([69f8fdc](https://github.com/axelhamil/clean-stack/commit/69f8fdcde621ea68908268aa7fb5ccc11b85b436))
* **drizzle:** add gdpr deletion fields + drop unused helpers ([da659a0](https://github.com/axelhamil/clean-stack/commit/da659a0b75d2be51350c38d8d7535437d8ada240))
* **ui:** add destructive variant to card ([ad18c31](https://github.com/axelhamil/clean-stack/commit/ad18c3197da876c6c95d1c93bd9889084cc758a7))

### Documentation

* add cron + integrations guides, document use-case vs service rule ([f8419dc](https://github.com/axelhamil/clean-stack/commit/f8419dc7180925828a4b0eba5233fb9d1c183161))
* **roadmap:** add pre-flight ownership gate to gdpr account deletion ([4f3ebc5](https://github.com/axelhamil/clean-stack/commit/4f3ebc580d9e2795688406793b2310a4343c2f75))

## [1.10.0](https://github.com/axelhamil/clean-stack/compare/v1.9.0...v1.10.0) (2026-04-30)

### Features

* **api,drizzle:** regenerate schema for better-auth organization plugin (teams enabled) ([e30eaed](https://github.com/axelhamil/clean-stack/commit/e30eaeda33d4edb1114a4d4094d3edfc8ccacf6f))
* **api:** add access control service with default org statements and roles ([5532a2e](https://github.com/axelhamil/clean-stack/commit/5532a2e3a46968c0e32882a8f785774a644b9a65))
* **api:** add org middleware guards for organization-scoped routes ([864507f](https://github.com/axelhamil/clean-stack/commit/864507fa5c54987af76e366ab7252b68d0a76e55))
* **api:** add org_invitation email template + wire sendinvitationemail ([b493ec5](https://github.com/axelhamil/clean-stack/commit/b493ec5983b2743e4777bb9dc32d2e0780e7b5d6))
* **api:** wire organization plugin full config + database hooks for personal org at signup ([12bec99](https://github.com/axelhamil/clean-stack/commit/12bec99c085d23ed704580cfc3ed18ce79ee9c76))
* **app,api:** personal-org slug helper + initials + logo-mark + storageerror as apperror ([2865156](https://github.com/axelhamil/clean-stack/commit/28651568f605615d3e52b0efb18db46dd2919bbb))
* **app:** /accept-invitation/$invitationId page (manual confirm, idempotent) ([4abd28b](https://github.com/axelhamil/clean-stack/commit/4abd28b905db1a253899c0e18ef1466bfd0113fd))
* **app:** /org/invitations page (send, list, cancel) ([25b512e](https://github.com/axelhamil/clean-stack/commit/25b512e7257cb9b42be0bc3ca56c5549d0f62f90))
* **app:** /org/members page (list, role change, remove) ([0a70d9d](https://github.com/axelhamil/clean-stack/commit/0a70d9dc7e36ebdbc7115f20dd3885bea4698e6c))
* **app:** /org/new page and wire switcher cta ([29a9d43](https://github.com/axelhamil/clean-stack/commit/29a9d43ef6a93776b17902b4c13b75597f2b12e6))
* **app:** /org/settings page (rename, leave, delete) ([ac1d2b7](https://github.com/axelhamil/clean-stack/commit/ac1d2b7c2a9eecfaefaa308bc2403dfc7f7c0087))
* **app:** add org mutation factories (crud, invite, accept and cancel, remove, role) ([108a4e2](https://github.com/axelhamil/clean-stack/commit/108a4e2ed4541769a5a5c6217ef6a6727e0a987c))
* **app:** add org query factories (active, membership, list, members, invitations) ([5d32dd1](https://github.com/axelhamil/clean-stack/commit/5d32dd1728b72ea701fe8a5fa69115c3ba3c4170))
* **app:** add organization client plugin with teams support ([673f1b7](https://github.com/axelhamil/clean-stack/commit/673f1b789b1ea4b89c9b74054c2f00d9c053009b))
* **app:** auth flows broadcast + passkey autofill + provider listener ([e9c0757](https://github.com/axelhamil/clean-stack/commit/e9c07576e1e99940bf625f5b6382fc67c1bbd93e))
* **app:** extend cross-tab broadcast listener to org-state queries ([9a7f176](https://github.com/axelhamil/clean-stack/commit/9a7f176bf714c7ed07dfe68a35af1f61ba640a53))
* **app:** member row and invitation row components ([d165eed](https://github.com/axelhamil/clean-stack/commit/d165eed2bdd1edc64d0d536455c0c1c8af25962f))
* **app:** org forms (create, update, invite member) with rhf and zod ([9e1fcdb](https://github.com/axelhamil/clean-stack/commit/9e1fcdbd887001a935686e6f5cfe7598340366d2))
* **app:** org switcher dropdown mounted in dashboard header ([bff19bc](https://github.com/axelhamil/clean-stack/commit/bff19bc9b56f5e960336532e66598a2f10ea03b4))
* **app:** org zod schemas (name, slug, role, create, update, invite) ([05f4fac](https://github.com/axelhamil/clean-stack/commit/05f4fac5f417071c0c99f7369f974bd8083b5d7c))
* **drizzle:** add with-org scoping helper for org-filtered queries ([75c92c1](https://github.com/axelhamil/clean-stack/commit/75c92c1b14a15a0a21c5d8290c1d6dadc71eac16))
* **packages,api:** extract @packages/access-control workspace ([8fab233](https://github.com/axelhamil/clean-stack/commit/8fab23398d3de5a2200b24eb1fc8110cb99df2c3))
* **ui,app:** backup-code-list primitive + remove-member confirm + account div collapse ([af2892a](https://github.com/axelhamil/clean-stack/commit/af2892aa3534317d333e3fd9a703f785eb2c2795))
* **ui:** align primary with palette + extract formcheckboxfield ([9d93f24](https://github.com/axelhamil/clean-stack/commit/9d93f243b7282b190295e613d95d68972036d3db))
* **ui:** cursor-pointer instead of cursor-default on shadcn item slots ([3bdf7a1](https://github.com/axelhamil/clean-stack/commit/3bdf7a1e13dffd0a269e2e1824500f6963dfe072))
* **ui:** native cursor pointer on shadcn data-slot triggers/items/options ([92cb290](https://github.com/axelhamil/clean-stack/commit/92cb2909df4ded12bbb7ac464e021b034858a5e9))

### Bug Fixes

* **app,api:** r12 main+h1 per page, slots, dark-mode qr, dead dto types ([bd409c0](https://github.com/axelhamil/clean-stack/commit/bd409c04448a6cc8ef4f5052118b779c25ddb7c9))
* **app:** swallow aborterror + add mutationkey on 16 hooks ([d1e98f2](https://github.com/axelhamil/clean-stack/commit/d1e98f265c3819b4edaef0727f589a64b683cb40))
* **drizzle:** align organization/team/team-member timestamps with existing convention ([bc0ee59](https://github.com/axelhamil/clean-stack/commit/bc0ee59660eb9413599c6623897c7426e46885e7))
* **ui:** align ring with primary + drop font-normal r10 leak in user-menu ([1c3c198](https://github.com/axelhamil/clean-stack/commit/1c3c198122804f000e24a48301f4c8684116b7a9))

### Refactor

* **api,app:** sota 2026 (zod v4 z.email + safe role parse) ([f18f23d](https://github.com/axelhamil/clean-stack/commit/f18f23d804dedc00d896fdd952b0f09c0ab2bbb7))
* **api,ddd-kit:** consolidate error mapping into app.onerror ([7d35a50](https://github.com/axelhamil/clean-stack/commit/7d35a507aa9c16b9e62e8b51ee825546808f09f2))
* **api:** extract upload zod schemas to application/dto ([0e9acfb](https://github.com/axelhamil/clean-stack/commit/0e9acfbfa58f10c19d66962c3763879abc0c621e))
* **app,api,packages:** promote shared helpers + ispersonalorg ssot ([b327dd6](https://github.com/axelhamil/clean-stack/commit/b327dd663b82b7cdeb3c1de7e5c8117c51d98fb6))
* **app,api:** infra polish (sign-out key, glass utility, dedup, hook scope, session log) ([94ea6df](https://github.com/axelhamil/clean-stack/commit/94ea6df54ff22bfbdabec6d7fe1c61e29e385f70))
* **app:** apply displayname + formatdate helpers to call sites ([0c60cde](https://github.com/axelhamil/clean-stack/commit/0c60cde6a9af960c5ef6de130a4bb0e3a4b335f1))
* **app:** bundle accept-invitation multi-step in factory + hook ([606cb90](https://github.com/axelhamil/clean-stack/commit/606cb9029695804d51a99030250df7d1d8b7337e))
* **app:** consolidate account + organization pages under /settings ([fb7067f](https://github.com/axelhamil/clean-stack/commit/fb7067ff91af8a5ce8c4646a71d33ca0f75c9ea3))
* **app:** drop pointless single-line files ([56e4e2d](https://github.com/axelhamil/clean-stack/commit/56e4e2d0703f2cad21162c9f45fac9f78a87c340))
* **app:** extract emailrequestform, drop forgot+magic wrappers ([85066e1](https://github.com/axelhamil/clean-stack/commit/85066e19df491d1c203673ce7a5cbab642d12a17))
* **app:** hoist cross-feature infra to adapters/ ([1ae9074](https://github.com/axelhamil/clean-stack/commit/1ae907477ca1e1f94ac9d4b3f4443958f238783b))
* **app:** inline settings layout into route file ([9114b6d](https://github.com/axelhamil/clean-stack/commit/9114b6d7030c5be75f55765cd54a55ebd0b87eed))
* **app:** split _protected gate from shell layout ([a2d01eb](https://github.com/axelhamil/clean-stack/commit/a2d01eb8fd53aa66aff532b5ba3bf47e4045c590))
* **app:** use list-row + typography exports in org components and pages ([1a3f60b](https://github.com/axelhamil/clean-stack/commit/1a3f60b5c10fd67d6efc3b64e7aed82e69706db8))
* **ui,app:** use cardaction slot natively + cardtitle destructive variant ([7ce022a](https://github.com/axelhamil/clean-stack/commit/7ce022a48f9f9577d594febb928cf736048a565b))

### Documentation

* add features inventory + history rationale + multi-tenant rules ([0d8ab6e](https://github.com/axelhamil/clean-stack/commit/0d8ab6ea4e42614c8aeabd1854bb7304f81b6205))
* add organization scoping rules and donts to claude.md ([13e640e](https://github.com/axelhamil/clean-stack/commit/13e640e5700b075e339278e38ab23b325232a9ae))
* close multi-tenant phase 2 on roadmap ([ca83c8f](https://github.com/axelhamil/clean-stack/commit/ca83c8f954daa7c33478d60640eb5ca5daa1db62))
* close resend phase 1 with provider-side suppression + dns guide ([523fdde](https://github.com/axelhamil/clean-stack/commit/523fddeb8aa20d2c11b579fd900ad7b7900e4e51))
* sync readme to actual shipped state ([a21fef7](https://github.com/axelhamil/clean-stack/commit/a21fef7a21d8e762a8904f22d07313abe95601c9))

## [1.9.0](https://github.com/axelhamil/clean-stack/compare/v1.8.0...v1.9.0) (2026-04-29)

### Features

* **api,app:** r2-first storage feature + hono rpc sota 2026 + flat inwire di ([ba74e22](https://github.com/axelhamil/clean-stack/commit/ba74e22968a60b7a1e13e80bb5b86d682abd029d))

## [1.8.0](https://github.com/axelhamil/clean-stack/compare/v1.7.0...v1.8.0) (2026-04-29)

### Features

* **api:** wire resend email port + adapter via inwire ([7a33e13](https://github.com/axelhamil/clean-stack/commit/7a33e131d1a7f4c1d621ac57da25b084906ec3e9))

## [1.7.0](https://github.com/axelhamil/clean-stack/compare/v1.6.0...v1.7.0) (2026-04-29)

### Features

* **api:** wire better-auth + structured pino logging + middleware ([65db818](https://github.com/axelhamil/clean-stack/commit/65db8182302a511a7e8233557215d041211edc59))
* **app:** better-auth flows + account security + route gates ([97baa68](https://github.com/axelhamil/clean-stack/commit/97baa68066516b1ddba16b514bdc4b5f6e5f5e0c))
* **ui:** add form-text-field, list-row, text-link primitives ([4325028](https://github.com/axelhamil/clean-stack/commit/43250284a01c230cbf06f6fffb99897bd717f314))

### Refactor

* **app:** rename common/ui to common/components ([8066267](https://github.com/axelhamil/clean-stack/commit/8066267be247dc92d91a91330bf59c9e628e1bd9))
* **ddd-kit:** drop unused http helpers ([cf729de](https://github.com/axelhamil/clean-stack/commit/cf729dea92dfacd0cf6f6b9f9b2105ef22e7d889))

### Documentation

* **claude:** document dev/main release flow ([552aa4f](https://github.com/axelhamil/clean-stack/commit/552aa4f874cefd6804d2220e88f3cd4366e29b68))
* codify auth integration rules + bump lockfile ([ebe7d5b](https://github.com/axelhamil/clean-stack/commit/ebe7d5bf1b622a2c63b957a8abf7da3cec944812))

## [1.6.0](https://github.com/axelhamil/clean-stack/compare/v1.5.1...v1.6.0) (2026-04-29)

### Features

* **app:** frame clean-stack around lean startup build/measure/learn ([c5ddf00](https://github.com/axelhamil/clean-stack/commit/c5ddf006729ffe58c9cd1d10f9942bff90859f3c))

## [1.5.1](https://github.com/axelhamil/clean-stack/compare/v1.5.0...v1.5.1) (2026-04-29)

### Refactor

* **app:** shadcn-pure landing + nav-link primitive ([4da680d](https://github.com/axelhamil/clean-stack/commit/4da680ddd63a0e602801199f3eda2f00e7c1d2d9))

## [1.5.0](https://github.com/axelhamil/clean-stack/compare/v1.4.0...v1.5.0) (2026-04-29)

### Features

* **app:** saas-ready landing rewrite + motion primitives + i18n roadmap ([76df116](https://github.com/axelhamil/clean-stack/commit/76df1160f2ee81ee641a1f0b7acd2b9d42a698ba))

### Documentation

* **roadmap:** add roadmap + minio dev storage ([0ad0851](https://github.com/axelhamil/clean-stack/commit/0ad08511a59a65fe25fc7c7e1ab6542bc8fcb6c8))

## [1.4.0](https://github.com/axelhamil/clean-stack/compare/v1.3.0...v1.4.0) (2026-04-29)

### Features

* **app:** redesign home + typography + theme toggle + arch rules ([be53307](https://github.com/axelhamil/clean-stack/commit/be5330767e7ab5d4bfb4290bcbbb7ad9fdb1313f))

## [1.3.0](https://github.com/axelhamil/clean-stack/compare/v1.2.0...v1.3.0) (2026-04-29)

### Features

* sota april 2026 boilerplate refresh — hono rpc, next-flavored app, lean tooling ([a943390](https://github.com/axelhamil/clean-stack/commit/a94339054816fd538a973fd9bcde73a1cda3fe08))

### Bug Fixes

* **app:** add lucide-react direct dep (used in features/home) ([8dfa4f4](https://github.com/axelhamil/clean-stack/commit/8dfa4f41014724557750590793483de6a8d576b2))
* **ddd-kit:** add @types/node devdep (uses node:crypto) ([d9b045d](https://github.com/axelhamil/clean-stack/commit/d9b045d034fccc8a0015d8609f3771978b089899))
* **tsconfig:** hono preset uses bun types not node (api runs on bun) ([d85fb3e](https://github.com/axelhamil/clean-stack/commit/d85fb3e243f1e30e6162299a6f6163766d0f8a29))

## [1.2.0](https://github.com/axelhamil/clean-stack/compare/v1.1.0...v1.2.0) (2026-04-28)

### ⚠ BREAKING CHANGES

* complete repo restructure. The previous Next.js app
with auth/billing/LLM features is removed. New layout:
- apps/api (Hono + Node.js, bare skeleton)
- apps/app (Vite + React 19 + TanStack Router, bare skeleton)
- packages/{ddd-kit, drizzle, test, typescript-config, ui}

History preserved via CHANGELOG.md.

### Features

* rebuild as generic boilerplate ([5f0d32e](https://github.com/axelhamil/clean-stack/commit/5f0d32e0a46d9931613aaa04cd716987fac033ed))

### Documentation

* add boilerplate restructure design spec ([c55214a](https://github.com/axelhamil/clean-stack/commit/c55214a4059bd1dde9d2e8d6a3401f5bf23583f2))
* add boilerplate restructure implementation plan ([071862d](https://github.com/axelhamil/clean-stack/commit/071862d4dff55bb5b879398584e18683ba597955))

# [1.1.0](https://github.com/axelhamil/CleanStack/compare/v1.0.0...v1.1.0) (2026-02-11)


### Bug Fixes

* **e2e:** use production server in ci ([8abaaa1](https://github.com/axelhamil/CleanStack/commit/8abaaa109c916840bb93a2db85a17f404bd28cd0))
* **nextjs:** add tsconfig paths for workspace packages ([af54d65](https://github.com/axelhamil/CleanStack/commit/af54d65fdbe9c2ff9fad060646269da7258ab7f0))
* vercel build ([2bb3524](https://github.com/axelhamil/CleanStack/commit/2bb35242fc45d30f608f55dda16a92e8ea5b57c4))
* **vercel:** disable framework auto-detection for monorepo ([20a745d](https://github.com/axelhamil/CleanStack/commit/20a745db2916adf1e959ae20b0df636a008b5f65))
* **vercel:** use pnpm build with db:migrate ([64b1cd3](https://github.com/axelhamil/CleanStack/commit/64b1cd3974d93179b09ce8d8f10bf0588f9cc910))
* **vercel:** use turbo directly in build command ([16634e4](https://github.com/axelhamil/CleanStack/commit/16634e4fab9bea387d68466720c6f01edbdfa0b1))


### Features

* **llm:** add application layer dtos (task 20) ([22adab4](https://github.com/axelhamil/CleanStack/commit/22adab45a85957a5c83f8d104f91a772a4f379f6))
* **llm:** add application port interfaces (task 19) ([4074e05](https://github.com/axelhamil/CleanStack/commit/4074e0572c8c389c0f3c70b7ca765f81e1dbdf13))
* **llm:** add domain-prompt class with tests (tasks 17-18) ([fd38cba](https://github.com/axelhamil/CleanStack/commit/fd38cbabc60b44ced819aa0e40eb816c94aa19b9))
* **llm:** complete llm-usage domain implementation (task 16) ([9d5d36f](https://github.com/axelhamil/CleanStack/commit/9d5d36fe24c15544a6c1daabfcc8aeec6713349e))
* **llm:** complete module with ui, server actions, and final validation ([8a725c8](https://github.com/axelhamil/CleanStack/commit/8a725c8eb850bd8f6ac27a91bfe0cd986c87acf8))
* **llm:** create llm module directory structure ([6ed7a05](https://github.com/axelhamil/CleanStack/commit/6ed7a05afd0abf73c8b6469919bdbf4fc5100f85))
* **llm:** create llm module directory structure ([1cfa8ac](https://github.com/axelhamil/CleanStack/commit/1cfa8ac10b140dffe9ff93bf41ce2d0af94132a4))
* **llm:** implement conversation aggregate id ([cf00d3e](https://github.com/axelhamil/CleanStack/commit/cf00d3ea1f267dca0273c1c2d7aadf3d1b1d708f))
* **llm:** implement conversation aggregate with domain events ([6c56653](https://github.com/axelhamil/CleanStack/commit/6c56653f1b1771e1bf98521f351e5a53ef41a921))
* **llm:** implement conversation management use cases (task 28 - green) ([365aa1c](https://github.com/axelhamil/CleanStack/commit/365aa1c18b13246c5d7bec82f9197c6eeaf8afc3))
* **llm:** implement conversation value objects ([402b9e1](https://github.com/axelhamil/CleanStack/commit/402b9e19cee70eb0630352ba367fa0c51d61e56d))
* **llm:** implement create-managed-prompt use case - task 30 green ([0dc62b4](https://github.com/axelhamil/CleanStack/commit/0dc62b41762e32c755dedd8475107f943f545d86))
* **llm:** implement drizzle repositories with type-safe persistence mapping ([0d14dbb](https://github.com/axelhamil/CleanStack/commit/0d14dbba28cc3da311e39227ceafb60c97a8f1a2))
* **llm:** implement mappers for domain/persistence conversion - task 38 green ([f816de1](https://github.com/axelhamil/CleanStack/commit/f816de1f6380d0280bfa8607718039a0194b2351))
* **llm:** implement message entity and value objects ([f206677](https://github.com/axelhamil/CleanStack/commit/f2066772d10fc753a17e0cabae2fe10fa5653861))
* **llm:** implement query and utility managed prompt use cases - task 34 green ([7e0b0c2](https://github.com/axelhamil/CleanStack/commit/7e0b0c2443db608610af1bfe886a9a8d909fbe76))
* **llm:** implement routing and cost use cases - task 36 green ([c96b39a](https://github.com/axelhamil/CleanStack/commit/c96b39a0ddd7021f2942a80f6ad91b5013bf3fe9))
* **llm:** implement send chat message use case (task 26 - green) ([95a2f96](https://github.com/axelhamil/CleanStack/commit/95a2f96a56b27354a3d1dff452b9db5b155de0e6))
* **llm:** implement send completion use case (task 22 - green) ([6760c9c](https://github.com/axelhamil/CleanStack/commit/6760c9c2d8e5ff521e61e71cd534fdaa9bb34a24))
* **llm:** implement stream completion use case (task 24 - green) ([e84ff79](https://github.com/axelhamil/CleanStack/commit/e84ff79a84bdfd6364f35b40f1d4695e07786768))
* **llm:** implement update-managed-prompt use case - task 32 green ([1a4c37f](https://github.com/axelhamil/CleanStack/commit/1a4c37f01acc5dc1caa2297cc6d353c86b1b5912))
* **llm:** mark all acceptance criteria as complete ([26750f2](https://github.com/axelhamil/CleanStack/commit/26750f2163cc2171fbfbb0d4858b3a37874c87d0))
* **llm:** verify llm database schema ([d31324e](https://github.com/axelhamil/CleanStack/commit/d31324eab9f14e8563149ee2eb44c869725215b1))
* **llm:** write repository tests (red phase) - task 39 ([e6bdfd2](https://github.com/axelhamil/CleanStack/commit/e6bdfd22c9638cc8006e79df3df188e2309ce104))
* **llm:** write routing and cost use case tests - task 35 red ([6867fcd](https://github.com/axelhamil/CleanStack/commit/6867fcd340fbfc7cb5faef004204c66e12bf2c0b))

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-01-15

### Added

- 🏛️ Clean Architecture structure with domain, application, adapters layers
- 📦 ddd-kit package with Result, Option, Entity, Aggregate, ValueObject, UUID
- 🔐 Authentication with BetterAuth (sign up, sign in, sign out, sessions, email verification)
- 🔑 OAuth providers (Google, GitHub)
- 💳 Stripe integration (checkout, webhooks, customer portal)
- 📧 Email templates with Resend and React Email
- 🎨 UI components with shadcn/ui and Tailwind CSS 4
- 🤖 Claude Code skills: /eventstorming, /feature-prd, /gen-domain, /gen-usecase, /gen-tests
- 🤖 Claude Code agents: feature-architect, code-reviewer, test-writer, doc-writer
- 📊 Domain events system with typed payloads
- 🧪 BDD testing setup with Vitest (90%+ coverage)
- 📱 Expo mobile app with React Native
- 🔍 Quality tooling: jscpd, knip, Biome, Husky
- 📈 Sentry error tracking integration
- 🚀 Vercel deployment configuration

### Infrastructure

- Monorepo with Turborepo
- PostgreSQL with Drizzle ORM
- GitHub Actions CI/CD with Codecov
- Pre-commit hooks with lint-staged and commitlint

### Documentation

- CLAUDE.md with AI development guide
- Professional README with architecture overview
- Comprehensive test coverage

## [0.1.0] - 2024-12-01

### Added

- Initial project structure
- Basic auth implementation with BetterAuth
- ddd-kit primitives (Result, Option, Entity)
- Next.js 16 with App Router
- Drizzle ORM setup

---

[Unreleased]: https://github.com/axmusic/nextjs-clean-architecture-starter/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/axmusic/nextjs-clean-architecture-starter/releases/tag/v1.0.0
[0.1.0]: https://github.com/axmusic/nextjs-clean-architecture-starter/releases/tag/v0.1.0
