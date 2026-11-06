## [2.2.0](https://github.com/axelhamil/clean-stack/compare/v2.1.0...v2.2.0) (2026-11-02)

### Features

* **infra:** back up postgres with pgbackrest and harden the vps host ([8f29788](https://github.com/axelhamil/clean-stack/commit/8f297885b0bf24ba9dd7a0e72f84935b2634ad9f))
* **infra:** deploy to a vps through coolify instead of railway ([fac42c4](https://github.com/axelhamil/clean-stack/commit/fac42c4accfef9055880b1e0606fa200a4931dad))

## [2.2.3](https://github.com/axelhamil/clean-stack/compare/v2.2.2...v2.2.3) (2026-11-06)


### Bug Fixes

* give each package its own vitest module cache ([#155](https://github.com/axelhamil/clean-stack/issues/155)) ([550f697](https://github.com/axelhamil/clean-stack/commit/550f69794426aabde68c2946000e5506aa42a96d))


### Refactor

* **api:** compose api-token, notifications, uploads and billing ([#152](https://github.com/axelhamil/clean-stack/issues/152)) ([f208bec](https://github.com/axelhamil/clean-stack/commit/f208bec8f2e46e531606eb02167d7de931b887b4))
* **api:** compose quotas, policies, consents, profile and audit-log ([#151](https://github.com/axelhamil/clean-stack/issues/151)) ([efd37be](https://github.com/axelhamil/clean-stack/commit/efd37be1b006c65907529f1fbcab73c2d7653d31))
* **api:** compose webhooks, rgpd and admin ([#156](https://github.com/axelhamil/clean-stack/issues/156)) ([ab0025d](https://github.com/axelhamil/clean-stack/commit/ab0025d44c8c19d7a3e4357f58068c668b80f124)), closes [#150](https://github.com/axelhamil/clean-stack/issues/150)
* **ddd-kit:** align the kit with typed ids, own clone collections and payload parsing ([#139](https://github.com/axelhamil/clean-stack/issues/139)) ([c3317e7](https://github.com/axelhamil/clean-stack/commit/c3317e744fb29a4b8c0df3449068f33daa248ed8))
* extract the http, outbox and email kit packages from the api ([#145](https://github.com/axelhamil/clean-stack/issues/145)) ([c0e6d69](https://github.com/axelhamil/clean-stack/commit/c0e6d6962d4a424b477f96433ebd70a019dfd60b))

## [2.2.2](https://github.com/axelhamil/clean-stack/compare/v2.2.1...v2.2.2) (2026-11-06)


### Bug Fixes

* **api:** admin reads in the ambient transaction, api-token and billing rule fixes ([#131](https://github.com/axelhamil/clean-stack/issues/131)) ([0c5022d](https://github.com/axelhamil/clean-stack/commit/0c5022dd357aad6636eb9bf95075984c86d04dec))
* **api:** keep writes, events and errors inside their transaction ([#129](https://github.com/axelhamil/clean-stack/issues/129)) ([f0af8b7](https://github.com/axelhamil/clean-stack/commit/f0af8b707f62ed5e24d17862a94a4d5f96be6797))
* **api:** token use event in its transaction and rgpd application free of env and logger ([#135](https://github.com/axelhamil/clean-stack/issues/135)) ([2b76cd8](https://github.com/axelhamil/clean-stack/commit/2b76cd87bcab3e15e2424a09598a862badecefcd))
* **drizzle:** typed lease predicates and shared package rule fixes ([#128](https://github.com/axelhamil/clean-stack/issues/128)) ([5d3dad8](https://github.com/axelhamil/clean-stack/commit/5d3dad8fc6a4eda0626d4313c00f769c0aadf3a4)), closes [#125](https://github.com/axelhamil/clean-stack/issues/125)
* **front:** typed responses, no polling fallback and one shared error fallback ([#133](https://github.com/axelhamil/clean-stack/issues/133)) ([cb5250b](https://github.com/axelhamil/clean-stack/commit/cb5250b551e40a7f67bd3c075f5ab06d0a8d19ac))
* **rgpd:** revoke api tokens and announce memberships on account wipe ([#127](https://github.com/axelhamil/clean-stack/issues/127)) ([b38f7c4](https://github.com/axelhamil/clean-stack/commit/b38f7c4f05bc251f186f538eb9b87169b1f8e567))

## [2.2.1](https://github.com/axelhamil/clean-stack/compare/v2.2.0...v2.2.1) (2026-11-06)


### Bug Fixes

* **api:** keep an email batch whole and its claim off a seq scan ([2de1bfd](https://github.com/axelhamil/clean-stack/commit/2de1bfd1c61ad4a6cb5d453aba34d46edf2613f0))
* **api:** replay a failed email chunk with the same idempotency key ([6ed4432](https://github.com/axelhamil/clean-stack/commit/6ed4432585da41cca3e624d744fc2dff01efa7eb))
* **api:** replay a failed email chunk with the same idempotency key ([cbacd98](https://github.com/axelhamil/clean-stack/commit/cbacd980d345a473b39d42454d6cf7a87da6d93d))
* **ci:** drop the turbo cache and scope the token to read ([3e04bb8](https://github.com/axelhamil/clean-stack/commit/3e04bb88c102210f418b0787808675d66f454ac1))
* **ci:** keep schedules, deploys and the pr policy right with dev as default ([7924e77](https://github.com/axelhamil/clean-stack/commit/7924e7726b7a62cad10e40a6df2c35b3ff6143c6))
* **deploy:** bake the analytics script url into the app image ([d729396](https://github.com/axelhamil/clean-stack/commit/d729396f3884bccfbc63512340cd2334ed53e5a0))
* **deploy:** poll only the scheduled tasks a deploy waits on ([0df9bb9](https://github.com/axelhamil/clean-stack/commit/0df9bb9253177fec06d767468733543876dfe556))
* **deploy:** schedule rgpd and notification jobs, bake analytics url ([efbecb4](https://github.com/axelhamil/clean-stack/commit/efbecb449146c5b21fe18a76ae58a1437c477348))
* **deploy:** schedule the rgpd sweep and the notification email flush ([eeda1e6](https://github.com/axelhamil/clean-stack/commit/eeda1e628c348172eddc84d6d92975c65793f4e8))
* **notifications:** hold the flush single-flight for its whole transaction ([b40bdd9](https://github.com/axelhamil/clean-stack/commit/b40bdd94c87c677788c37b0ee88053ac1e4dbab8))
* **notifications:** keep the flush single-flight for its whole transaction ([c86f958](https://github.com/axelhamil/clean-stack/commit/c86f958b89efe3912bc8add5b6d1e49d5e7719f6))
* **rgpd:** fail the deletion sweep when its batch cannot be loaded ([314932d](https://github.com/axelhamil/clean-stack/commit/314932d04cd0f99b248ff4840304ad86a80ea2b2))


### Refactor

* **drizzle:** share the transaction scoped advisory lock ([3ecc18d](https://github.com/axelhamil/clean-stack/commit/3ecc18d00e3ab254703b37b4aedcf7bbcb4f1c48))

## [2.1.0](https://github.com/axelhamil/clean-stack/compare/v2.0.0...v2.1.0) (2026-11-02)

### Features

* **admin:** announce every session the back office ends as signed out ([0a0e6c4](https://github.com/axelhamil/clean-stack/commit/0a0e6c45bdd170e34401a019d348dd3d17ccba3b))
* **app:** show the not-found page inside the app shell when signed in ([799d88d](https://github.com/axelhamil/clean-stack/commit/799d88da992fbe7ebcd308fc155099fa7d262780))

### Bug Fixes

* **billing:** answer 402 when an organization has no seat left ([d72c20b](https://github.com/axelhamil/clean-stack/commit/d72c20b4aae95ea9eccd405cd9f70054048b842c))

### Performance

* **billing:** index the stripe customer id of users ([6cf7fd5](https://github.com/axelhamil/clean-stack/commit/6cf7fd5cbd1806b2ebc1eafaf060d5b671709181))

### Documentation

* **roadmap:** close the post phase k open items ([d6b86a0](https://github.com/axelhamil/clean-stack/commit/d6b86a0914dcb5315104be9ac67b7fbef75d2e20))

## [2.0.0](https://github.com/axelhamil/clean-stack/compare/v1.24.1...v2.0.0) (2026-11-02)

### ⚠ BREAKING CHANGES

* **sso:** SCIM tokens issued before the move to managed connections
no longer authenticate, since the legacy `scim_provider` table is dropped.
Every organization that provisions through SCIM must issue a new token from
the SSO settings page and paste it into its identity provider. The API also
needs a new `SCIM_CREDENTIAL_HASH_SECRET` (at least 32 characters, required
in production), the HMAC key directory tokens are stored under; rotating it
invalidates every issued token.

### Features

* **admin:** add accounts, organizations, audit, team and approvals screens ([9ea6652](https://github.com/axelhamil/clean-stack/commit/9ea6652f5b7f3982029c6dcdeb538d3375957ede))
* **admin:** add four-eyes approval of sensitive actions ([e3bb4c3](https://github.com/axelhamil/clean-stack/commit/e3bb4c38633116cd6e7f4600fa704d90d7d97a7c))
* **admin:** add plan overrides and staff notes to the account screens ([58c3dc7](https://github.com/axelhamil/clean-stack/commit/58c3dc7b0eb26921d4a1fb8db1b2f7307e8c5065))
* **admin:** add staff roles and permissions behind the admin routes ([2cdab7e](https://github.com/axelhamil/clean-stack/commit/2cdab7ea687e4f36eb83f343c0dd9f226da4a22e))
* **admin:** add the back office app shell ([77e5cdf](https://github.com/axelhamil/clean-stack/commit/77e5cdf9595fc0ef2a7cae8ea0bc5dc7c1030677))
* **admin:** add the inbox home, the palette and private saved views ([063280d](https://github.com/axelhamil/clean-stack/commit/063280d8b688391546d2b0d46bba3d38d5d1cf19))
* **admin:** add the operations screen with requeue, heartbeats and stripe replay ([945321a](https://github.com/axelhamil/clean-stack/commit/945321a6d2e0b8304759f6fde4a5f90561ec2179))
* **admin:** announce every end of an impersonation ([e375a26](https://github.com/axelhamil/clean-stack/commit/e375a26c3cccd1c3cbc06d81824a87770fd17982))
* **admin:** make admin writes atomic and require a step-up ([402790d](https://github.com/axelhamil/clean-stack/commit/402790d45e04d83b69387444326ea0f0686a6456))
* **api:** add behavioural security signals and a captcha hook ([719c4b4](https://github.com/axelhamil/clean-stack/commit/719c4b4a3b022d4490989b05c33477564f8dcbf4))
* **api:** let instrumentation flush pending events on demand ([eba6575](https://github.com/axelhamil/clean-stack/commit/eba6575005989a7d0d950e4e6d12d9f8e6a23237))
* **app:** explain icons, truncated values and disabled controls with tooltips ([7de1858](https://github.com/axelhamil/clean-stack/commit/7de1858d7419e93146b972e6d35f5e0097a269e1))
* **app:** rebuild every screen on the sober tool direction ([1001166](https://github.com/axelhamil/clean-stack/commit/1001166de2692c6aa95112bd2af3860ac40b3986))
* **app:** remove the admin screens and return to the back office after impersonation ([47c3ef1](https://github.com/axelhamil/clean-stack/commit/47c3ef1953cd82a4e8cf9e4bdebb5a32e31fbf27))
* **app:** show a not-found page on unknown urls ([8ce5373](https://github.com/axelhamil/clean-stack/commit/8ce537307dde2deee9d87f4033c829fe7ad4540d))
* **consents:** record when pre-login cookie consent is attached to an account ([af3a9f3](https://github.com/axelhamil/clean-stack/commit/af3a9f3867b495625cfaa73e9e413bbe3df31c2a))
* **cron:** ping a heartbeat url around the sweep run ([9b4aab8](https://github.com/axelhamil/clean-stack/commit/9b4aab86ab68fac026175e0b624d7642a4265202))
* **ddd-kit:** add map, flatmap, maperror, match and all to result ([03a4a82](https://github.com/axelhamil/clean-stack/commit/03a4a82286fb40a877b5d573bbec0c259525ccb0))
* **ddd-kit:** add toresult, trymap and equals to option ([4f76953](https://github.com/axelhamil/clean-stack/commit/4f7695385bb183182f5d8229722715effc1a187c))
* **ddd-kit:** add uuid parse and make uuidv7 monotonic ([34ad911](https://github.com/axelhamil/clean-stack/commit/34ad911adf243fb3b5ea0ed73092967baff6843c))
* **ddd-kit:** carry the transaction and collected events in one ambient scope ([b519af4](https://github.com/axelhamil/clean-stack/commit/b519af495c67e0690afa92688a13abdc68f3d5ee))
* **ddd-kit:** give domain events an id and compare value objects by json ([8dbbc16](https://github.com/axelhamil/clean-stack/commit/8dbbc16c17d86d2637111223c928721fd0874fde))
* **email:** claim and settle queued mail by lease with a replayed dead state ([e640cf9](https://github.com/axelhamil/clean-stack/commit/e640cf9fe2f9c482ee9c885564bad76072ba5d49))
* **outbox:** add dead state and per handler delivery columns ([4a82c3a](https://github.com/axelhamil/clean-stack/commit/4a82c3a8096d9c878f274bc1b8a20faa87186c00))
* **outbox:** claim events by lease and settle them per attempt ([6c0c92d](https://github.com/axelhamil/clean-stack/commit/6c0c92d684837c021573572c5de9e3ceb410a412))
* **outbox:** return the stored event id and document delivery bookkeeping ([40770fb](https://github.com/axelhamil/clean-stack/commit/40770fb9945693ec8825c82205e8d03851a75439))
* **outbox:** run handlers outside transactions with retry and a dead state ([d3c6d26](https://github.com/axelhamil/clean-stack/commit/d3c6d26b809f5e1331066857c362e8ae8997556e))
* **sso:** provision scim directories through managed connections ([4db5983](https://github.com/axelhamil/clean-stack/commit/4db5983d0360104e935717b60b93f27f55bdf47e))
* **sso:** require reconnecting scim directories with managed tokens ([efa4464](https://github.com/axelhamil/clean-stack/commit/efa44641e7fdd9d14d221962c67ef05f228c717e))
* **ui:** replace the theme with the sober tool direction ([1f28182](https://github.com/axelhamil/clean-stack/commit/1f281826c673db77f6722ce97cd93c44e4805d9e))
* **webhooks:** claim and settle deliveries by lease with a replayed dead_letter ([1dc2a63](https://github.com/axelhamil/clean-stack/commit/1dc2a632d52ad0c43a461a721572b2653046dbfe))
* **webhooks:** record who replays a webhook delivery ([f2feafb](https://github.com/axelhamil/clean-stack/commit/f2feafbee9e8cdf794cb31130d8eb96ef8b6e320))

### Bug Fixes

* **account:** show a wrong current password under the right field ([95fa666](https://github.com/axelhamil/clean-stack/commit/95fa6666fc7c2ca5a1321ed714f65dea7207e55c))
* **admin:** close the approval, override and list gaps found in review ([d0edd2e](https://github.com/axelhamil/clean-stack/commit/d0edd2e7c7e7870e086940f6322278dd512ffed4))
* **admin:** close the four-eyes bypasses found in review ([e66a0e5](https://github.com/axelhamil/clean-stack/commit/e66a0e5a19032a41dd5b8cb14b55d81bd5f42e23))
* **admin:** close the privilege gaps of the staff model ([cf1c34e](https://github.com/axelhamil/clean-stack/commit/cf1c34e18dcb4eb762824cd56f606f64461d47ad))
* **admin:** close the production and reuse gaps of the back office shell ([8785ec3](https://github.com/axelhamil/clean-stack/commit/8785ec38121f2487b211f542d70dfa78b22c702c))
* **admin:** close the replay, inbox and read failure gaps found in review ([e37a96d](https://github.com/axelhamil/clean-stack/commit/e37a96dcf2821a15ad96e0263dba02a455ffe657))
* **admin:** close the step-up and session gaps found in review ([f3abfd8](https://github.com/axelhamil/clean-stack/commit/f3abfd84cc6fd109264ab728cad8457d928d12e7))
* **admin:** end impersonations when staff access is lost ([968c882](https://github.com/axelhamil/clean-stack/commit/968c882806fcf6e3a5544955c3c099e7c5a6e81b))
* **admin:** settle stripe verification, replay scope and saved view filters ([8e62034](https://github.com/axelhamil/clean-stack/commit/8e62034e83bfc146816c017299e239d8992ae49d))
* **api-token:** answer 400 to a scan payload that is not a list of entries ([cc227cb](https://github.com/axelhamil/clean-stack/commit/cc227cb6582e5978bd1b96a652f88e015c9fdbd5))
* **api:** attribute an org auto-deleted by scim deprovisioning to its owner ([bbeef4a](https://github.com/axelhamil/clean-stack/commit/bbeef4a590bc66d0c6184215fab66c1e7ad2b220))
* **api:** attribute system events to no user in the audit trail ([8524710](https://github.com/axelhamil/clean-stack/commit/85247108f5b5f444bb8e6d3a1d48dd6d5cf833d4))
* **api:** close the review pass defects in errors, auth, limits and csrf ([177c61b](https://github.com/axelhamil/clean-stack/commit/177c61b2ac65592053329d547150bbeca0d2046f))
* **api:** commit the public api name change and its event together ([90c25cc](https://github.com/axelhamil/clean-stack/commit/90c25cc227a71ae722561fc497b382e9d0641def))
* **api:** keep a failed lease release from failing a committed digest flush ([3ef56f2](https://github.com/axelhamil/clean-stack/commit/3ef56f2a13ba8c910df9543f2a47d0eafeab6711))
* **api:** keep the api running when the email worker's first drain fails ([da2b873](https://github.com/axelhamil/clean-stack/commit/da2b873849c1bbd838a4687b9d899ac36c44e19e))
* **api:** keep the api running when the outbox dispatcher's first drain fails ([90a9a3a](https://github.com/axelhamil/clean-stack/commit/90a9a3aa520e1b37fea9fc5acf5eae4e9e76ce1f))
* **api:** record signup policy acceptance with the trusted-proxy client ip ([6476584](https://github.com/axelhamil/clean-stack/commit/6476584286c67b57b7dcadb2c0123296f0d96046))
* **api:** scrub query params and emails from sentry exception text ([dbaa8fb](https://github.com/axelhamil/clean-stack/commit/dbaa8fbb8a2f2a568b4efe46491324a60ad2242e))
* **app:** accept only a bare origin as the back office url and close phase k ([a338583](https://github.com/axelhamil/clean-stack/commit/a338583e0630dfce9460d214fb8dff7653188074))
* **app:** close the defects found by the final review ([baf6f8c](https://github.com/axelhamil/clean-stack/commit/baf6f8cad4c331da3575f8de5c1780042e8459d9))
* **app:** fall back to the build mode when the sentry environment is blank ([8f918e7](https://github.com/axelhamil/clean-stack/commit/8f918e78459e809923efef29d9a41e78360e9028))
* **app:** keep a page heading on admin detail pages while they load ([1edee9b](https://github.com/axelhamil/clean-stack/commit/1edee9b2e1a2b43c6265fe208d7f8654393c0d7c))
* **app:** keep loaded data on failed refetches and share page states ([23efcb7](https://github.com/axelhamil/clean-stack/commit/23efcb79772120ae903f5a07d5f6676b45e88a30))
* **app:** keep status and code on api failures so 4xx stay out of telemetry ([fb0081d](https://github.com/axelhamil/clean-stack/commit/fb0081dff6f66967ce9f70edce16142bdbfbb80f))
* **app:** keep the user menu initials in its accessible name ([ad51923](https://github.com/axelhamil/clean-stack/commit/ad51923787195b2afa9e70f8b13342a9e21e2149))
* **app:** stop reporting sso sign-in redirects as unexpected errors ([95b5715](https://github.com/axelhamil/clean-stack/commit/95b5715b082776384c739f20d3aa596026f8f1cf))
* **app:** stop the app shell overflowing small viewports ([c0c7ee0](https://github.com/axelhamil/clean-stack/commit/c0c7ee01a07e5a2680a2b05b2b3f3540c0a6bcd1))
* **app:** surface silent failures and keep invitees through sign-up ([c3aee61](https://github.com/axelhamil/clean-stack/commit/c3aee6162128e5c2829a904d85fe79e49d96f874))
* **app:** tell the user when copying the backup codes fails ([32893f2](https://github.com/axelhamil/clean-stack/commit/32893f2ee1fbe39cdea4f569208e38b035762d93))
* **auth:** record the trusted-proxy ip on new sessions ([5b9e8bf](https://github.com/axelhamil/clean-stack/commit/5b9e8bf887d629a25b964515099ad4dacea4269e))
* **auth:** show translated copy when sso sign-in fails ([97f04fa](https://github.com/axelhamil/clean-stack/commit/97f04fa55bc7b16110e9903dcef300ec41639259))
* **billing:** let better auth write stripe subscriptions ([b7a83e6](https://github.com/axelhamil/clean-stack/commit/b7a83e6ef0b28cb9ea30b30be7fdf56ade1a2968))
* **billing:** stop treating prototype names as valid plan tiers ([43d3281](https://github.com/axelhamil/clean-stack/commit/43d328173db7e63e876e37e2dca97a6fe02f60c1))
* **ci:** fail the pre-push chain on api type errors ([666e9f8](https://github.com/axelhamil/clean-stack/commit/666e9f8453310cd665ad84ff125e63be27074e33)), closes [api#type-check](https://github.com/axelhamil/api/issues/type-check)
* **ddd-kit:** keep watched list change tracking correct across re-adds ([fe11cac](https://github.com/axelhamil/clean-stack/commit/fe11cac6202dfbae1e1a89eb857c6a5de56b1831))
* **docker:** build on the latest published node 26 image ([b9ab8d2](https://github.com/axelhamil/clean-stack/commit/b9ab8d22f2a33d2aac03097f2daaa7791899d0f3))
* **docker:** prune with the turbo version the repo resolves ([5f8ec0c](https://github.com/axelhamil/clean-stack/commit/5f8ec0c241f4ff92e29d84a024316996b6379cb4))
* **drizzle:** roll back a unit of work whose callback returns a failed result ([4b3b0bd](https://github.com/axelhamil/clean-stack/commit/4b3b0bdc023f995c41eea9ee2c1549ed2da8e01b))
* **drizzle:** stop reporting every aborted transaction to sentry ([6352bb5](https://github.com/axelhamil/clean-stack/commit/6352bb5886e3a4b2ab64d3a6b77598fb354786f0))
* **events:** parse a stored api token expiry back into a date ([d9aaaa9](https://github.com/axelhamil/clean-stack/commit/d9aaaa9e3f1882921bf6d05acc310c857d05862b))
* **notifications:** stop a rate-limited preference save from toasting twice ([d6bee8e](https://github.com/axelhamil/clean-stack/commit/d6bee8e54efab931d7e6b2a9dd3b54f0760a4df7))
* **organization:** label the new owner picker in the transfer dialog ([4734922](https://github.com/axelhamil/clean-stack/commit/4734922566e30d1dc4441ea8244fe3a2f75a3f64))
* **outbox:** reconnect the listener with backoff and a keepalive ([437b5ec](https://github.com/axelhamil/clean-stack/commit/437b5ece98356b28b73bceb0273d86e2a1287594))
* **policies:** record the real client ip on policy acceptance ([9e7cd14](https://github.com/axelhamil/clean-stack/commit/9e7cd142560f159d05e474c614824aea04e78e65))
* **public-api:** audit profile name changes made through an api token ([0e7e89d](https://github.com/axelhamil/clean-stack/commit/0e7e89d8d01261e6d1ea4027e242caff78d910dc))
* **rgpd:** accept imported base32 totp secrets on account deletion ([ab5464b](https://github.com/axelhamil/clean-stack/commit/ab5464b964a2be1eaf80770b3b2cd74970334003))
* **rgpd:** ignore unconfirmed two-factor enrolments on account deletion ([0e66ff5](https://github.com/axelhamil/clean-stack/commit/0e66ff5767c404e1389fd8a08b2f7861d1b628c9))
* **rgpd:** report totp secret decryption failures to telemetry ([7ab08cc](https://github.com/axelhamil/clean-stack/commit/7ab08cc66d8288de607d313956a9a8b1dc6611b9))
* **rgpd:** verify totp with the rotated auth secrets ([5f749da](https://github.com/axelhamil/clean-stack/commit/5f749dac39aa52b43a0d9b36c312244a965a242f))
* **security:** confirm copied recovery codes only after the clipboard write ([5a09526](https://github.com/axelhamil/clean-stack/commit/5a09526131bbceac0042791536310d701deef78d))
* **sso:** keep scim connection writes consistent under concurrency ([df6b7bd](https://github.com/axelhamil/clean-stack/commit/df6b7bdb3513f8ab417ba80866949d48af4e82ba))
* **sso:** let a new user finish their first sso sign-in ([5ed0add](https://github.com/axelhamil/clean-stack/commit/5ed0adde10624fc33af9fe8d0702e68c73469ca0))
* **sso:** stop reporting rejected sso calls as unexpected failures ([45dae25](https://github.com/axelhamil/clean-stack/commit/45dae25d0680d21a4826072cfbc45deac2d3f4fa))
* **ui:** let the app name every label the shared primitives render ([b456a84](https://github.com/axelhamil/clean-stack/commit/b456a84ea4b8c696a1a89df9ad615c8ba304185f))
* **ui:** only confirm a copied value once the clipboard write succeeds ([391032a](https://github.com/axelhamil/clean-stack/commit/391032ac3e23ba9441e67403969aa529c31c9259))
* **webhooks:** report a failing first drain instead of crashing the api ([de3a699](https://github.com/axelhamil/clean-stack/commit/de3a699cd3686d3408618fe916ddd686728f2dcf))
* **webhooks:** stop doubling the page padding on the webhooks settings page ([ffed148](https://github.com/axelhamil/clean-stack/commit/ffed148ca09145aaaaf4bceb33efa2319436d66b))
* **webhooks:** stop exposing the previous secret cipher in responses ([526955b](https://github.com/axelhamil/clean-stack/commit/526955baa037b4d8ec6c2c8ca72e9573708e09ef))

### Refactor

* **access-control:** derive the owner grants from the app statement ([a2a95d4](https://github.com/axelhamil/clean-stack/commit/a2a95d4aabf778a89b9e2cdede8b75189003d1a9))
* **account:** move the avatar upload mutation into its own hook ([bfb65a4](https://github.com/axelhamil/clean-stack/commit/bfb65a47b53eccf4fbc40b2fea2a60a09369265c))
* **admin-audit-log:** narrow the metadata diff instead of casting it ([cb49d40](https://github.com/axelhamil/clean-stack/commit/cb49d400a71bdca9668f50695567da9a5ec681b6))
* **admin-orgs:** show a hyphen for an organization without a plan ([2c8e4f6](https://github.com/axelhamil/clean-stack/commit/2c8e4f6a58e6e81c014838c57f5895dd388c37b0))
* **admin-users:** derive every platform role type from one schema ([051653f](https://github.com/axelhamil/clean-stack/commit/051653f7b69c2991ae635564f9de340e9b0e44a4))
* **admin:** fold the staff forms into the back office app ([99adf6b](https://github.com/axelhamil/clean-stack/commit/99adf6bd5d159d4726ede24c10e64e6454196572))
* **admin:** read schema columns lazily in the admin stores ([019d122](https://github.com/axelhamil/clean-stack/commit/019d122ae6e3883b8e10d381c5df9999981a7512))
* **admin:** report admin store failures once, as typed results ([39e0bb9](https://github.com/axelhamil/clean-stack/commit/39e0bb93f2721f453f436563af66cad62aad86d8))
* **api-token:** carry unset token fields as options ([c5f7ca2](https://github.com/axelhamil/clean-stack/commit/c5f7ca2f4b408d29eb32dadfaf07207de64d3b27))
* **api-token:** keep the revoked reason nameable by the front ([ac82455](https://github.com/axelhamil/clean-stack/commit/ac82455c460aadae9dcf7a54a536b3de331d56b7))
* **api-token:** look up the leaked token owner as an option ([1543af1](https://github.com/axelhamil/clean-stack/commit/1543af1858bd3c9bf0f1ae7ab720a325b58fbcc1))
* **api-token:** map token rows through a mapper, not a cast ([b561724](https://github.com/axelhamil/clean-stack/commit/b5617246cdd47d7a182db7c3180daa17184e5d9a))
* **api-tokens:** keep the token schema free of react and its labels in the form ([0323327](https://github.com/axelhamil/clean-stack/commit/032332788ece4db3a1729d6a699b32627a6f3cb9))
* **api:** attribute audit rows and notifications from one actor lookup ([dc52f5a](https://github.com/axelhamil/clean-stack/commit/dc52f5ad867803eceaa54e8f359774c5b4b8f460))
* **api:** build every retention sweep route from one table pass ([02ffda6](https://github.com/axelhamil/clean-stack/commit/02ffda67555b57a5d6118b9d64111c2ca0d13f30))
* **api:** declare the csrf and auth rate-limit guards as tables ([47fd98b](https://github.com/axelhamil/clean-stack/commit/47fd98baf936748f7b5e853bfaf1d92ab6e36f09))
* **api:** declare the sso enforcement body once ([5c8b407](https://github.com/axelhamil/clean-stack/commit/5c8b407d95f7c1cb71d56f328546864a2c66c8d0))
* **api:** map audit rows through a single record mapper ([6c6df74](https://github.com/axelhamil/clean-stack/commit/6c6df744f8e739529d78bed0e6601f5f76b4c3f8))
* **api:** move the plan entitlements catalog to the shared kernel ([7d32a4f](https://github.com/axelhamil/clean-stack/commit/7d32a4fc4456dc8838aee4cc876bc82b789e79a2))
* **api:** name tests after their subject and drop duplicated notes ([676eadd](https://github.com/axelhamil/clean-stack/commit/676eadddad48a8b35278d9912c891a689015402f))
* **api:** pass the email batch idempotency key as an option ([1bd794d](https://github.com/axelhamil/clean-stack/commit/1bd794dcdffc51565fee893d97ea6d71f78b85c0))
* **api:** point both sso enforcement routes at the shared body ([2ce3486](https://github.com/axelhamil/clean-stack/commit/2ce3486e65f093b2b132befdfec8d1da2b4fca96))
* **api:** promote the api token port to the shared kernel ([1b48f56](https://github.com/axelhamil/clean-stack/commit/1b48f56afd119258aab77072db6b69c2e89c54ff))
* **api:** read org roles and api tokens through one lookup each ([eaa9c9d](https://github.com/axelhamil/clean-stack/commit/eaa9c9db4c70bdd08aa2e3dade6e8cee6e98523b))
* **api:** read the ambient transaction in api-token, profile, quotas, rgpd, webhooks ([f36bab1](https://github.com/axelhamil/clean-stack/commit/f36bab1ec32711b7bd4cbe067ae56e524724959b))
* **api:** read the ambient transaction in billing, consents, notifications, policies ([62001ac](https://github.com/axelhamil/clean-stack/commit/62001ac92954a49d6832cbb14abbc5d0489d6c21))
* **api:** read the ambient transaction in shared repositories ([87299e0](https://github.com/axelhamil/clean-stack/commit/87299e08a18047cdf3523531670b52873f3c7e72))
* **api:** report password policy violations as an option ([14973c6](https://github.com/axelhamil/clean-stack/commit/14973c6870cf5b446dec57c7e442502482ce9867))
* **api:** return failed results from units of work instead of throwing ([6980c77](https://github.com/axelhamil/clean-stack/commit/6980c77c923b4a785b46292216da1dd92f539050))
* **api:** return the next retry instant as an option ([0cce360](https://github.com/axelhamil/clean-stack/commit/0cce3601e8e2b22e7d4f01e689d99a083c979f5e))
* **api:** route worker and sweep transactions through the unit of work ([44babdb](https://github.com/axelhamil/clean-stack/commit/44babdb114bee4f577e51dcde1a228b69f6713d8))
* **api:** shape store failures with one shared helper ([4b597b4](https://github.com/axelhamil/clean-stack/commit/4b597b45947fea85d069a0f5eba43e1a4deaf825))
* **api:** share one harness across the database check scripts ([b6e2f74](https://github.com/axelhamil/clean-stack/commit/b6e2f7408069cc4ce92cc85a78ae2110efc5090f))
* **api:** share the best-effort security event emit ([a2b6897](https://github.com/axelhamil/clean-stack/commit/a2b68977b442fbab81e859996ce7331160b71ade))
* **api:** share the retry delay curve between the outbox and email workers ([335c28b](https://github.com/axelhamil/clean-stack/commit/335c28b1f8f39b20a7a93c6406fee9a70bb048a4))
* **api:** stop workers in order under a global shutdown deadline ([8da0b12](https://github.com/axelhamil/clean-stack/commit/8da0b12c92fb2f8e940267cf30534630f675e421))
* **api:** tidy shared kernel comments and dead fallbacks ([3a8d5d0](https://github.com/axelhamil/clean-stack/commit/3a8d5d0c4ba5dd907764b2df741c559ed8e2534d))
* **api:** trace every email queue write under its real statement ([196a62e](https://github.com/axelhamil/clean-stack/commit/196a62eb500bafcf33f556ee418945dc905462a6))
* **api:** trace the sso enforcement update as its own query ([107d163](https://github.com/axelhamil/clean-stack/commit/107d163caaf7ad198f6d47da1fd61d4d7b4753cb))
* **api:** write the sso enforcement flag through auth-queries ([d18f044](https://github.com/axelhamil/clean-stack/commit/d18f044e1a3a0c6c04c6737dbe3d4245c8c8820c))
* **app:** decide nav entry visibility in one place ([0fceb33](https://github.com/axelhamil/clean-stack/commit/0fceb330a7a302cad9b783610d1b49031b48d9b9))
* **app:** drop billing type re-exports nobody imports ([824301d](https://github.com/axelhamil/clean-stack/commit/824301d4bdc62c7edce955a4cce717d2621b1314))
* **app:** drop dash punctuation from shared auth, ui and notifications ([1551853](https://github.com/axelhamil/clean-stack/commit/1551853c3ab3d4b113163f001e5c6e23a6e3b05a))
* **app:** extract the shared web foundation into a package ([0f94c36](https://github.com/axelhamil/clean-stack/commit/0f94c360c1c2647c5e3f7f181dc0374c63a65472))
* **app:** gate the org members and invitations queries on the org ([243bbc4](https://github.com/axelhamil/clean-stack/commit/243bbc44012cbc7dce85afaa0ec5a753dc28303b))
* **app:** give notification category labels one home ([21ec4bd](https://github.com/axelhamil/clean-stack/commit/21ec4bdc463161a59a75c9be62c670d538fea7ec))
* **app:** keep the sign-out shortcut hint and binding together ([da0299b](https://github.com/axelhamil/clean-stack/commit/da0299b3af184982420795e13fbcf6003bd68e63))
* **app:** name the placeholder shown for an absent value once ([4d92587](https://github.com/axelhamil/clean-stack/commit/4d925877ac3e1819499191ce5037c4ed80c0184b))
* **app:** read api error fields through one guard ([9666a4b](https://github.com/axelhamil/clean-stack/commit/9666a4bab7ecec70fb4c739d95d1f9c64f36cd28))
* **app:** read consent categories from the shared package ([f1ae3f5](https://github.com/axelhamil/clean-stack/commit/f1ae3f5bdcc86b91c0c4818224e9c66fb76773ab))
* **app:** refresh the own session and other tabs through one hook ([53024b8](https://github.com/axelhamil/clean-stack/commit/53024b81cb273a5af2dd6a4b9dedeea15cba711e))
* **app:** replace dashes in shared comments and test names ([1ba8c04](https://github.com/axelhamil/clean-stack/commit/1ba8c0460aefb8a835c27a6c679e6a66a424a5b8))
* **app:** resolve a missing active organization in one place ([b4d269f](https://github.com/axelhamil/clean-stack/commit/b4d269ffaa95ad8c122a80fc1d1d5f644e3362b3))
* **app:** resolve request fallback copy from a catalog key ([fc27d2a](https://github.com/axelhamil/clean-stack/commit/fc27d2a96915e57c5918b6c0f0192133a3e07e7e))
* **app:** stop naming the broadcast channel factory like a hook ([7a9fe34](https://github.com/axelhamil/clean-stack/commit/7a9fe343b3faa03ebcb68f9f89ccc0a335da590b))
* **app:** tidy shared imports and platform admin checks ([cddd57c](https://github.com/axelhamil/clean-stack/commit/cddd57ca6bcab2fc8f59c063259c2a256585f1df))
* **app:** type the current membership role as an org role ([3b3d5b9](https://github.com/axelhamil/clean-stack/commit/3b3d5b9defd690e06de5347e85ae6dfff45cbfa1))
* **auth:** run the better-auth hooks in the ambient unit of work ([f46af3e](https://github.com/axelhamil/clean-stack/commit/f46af3e33854ecd6b6d527ea7bc782e4d589c417))
* **auth:** share the sign-in completion and token consumption steps ([6715112](https://github.com/axelhamil/clean-stack/commit/67151120036f1cacdf4e684536fd4205b309dcee))
* **auth:** share the totp settings between two-factor and account deletion ([659da3a](https://github.com/axelhamil/clean-stack/commit/659da3a70735f377e331a965ca4c77283e39413a))
* **billing:** derive subscription statuses from one list ([2e96e99](https://github.com/axelhamil/clean-stack/commit/2e96e9935a08f6d164f3ed5f3ef2039d1ade9a59))
* **billing:** open the billing portal through a service and gateway ([6aae8fa](https://github.com/axelhamil/clean-stack/commit/6aae8fa35b9b032cfb50b3fc0e9e6d85cb6454e4))
* **consents:** carry optional consent metadata as options ([92a3cb2](https://github.com/axelhamil/clean-stack/commit/92a3cb2f0c93933896e834b3974100ddb6240533))
* **ddd-kit:** flatten event collector add into guard clauses ([4fb9b0a](https://github.com/axelhamil/clean-stack/commit/4fb9b0acc06b06f6ae4b192cb6452a8c0e18ec44))
* **ddd-kit:** let repositories declare their error type ([7d38772](https://github.com/axelhamil/clean-stack/commit/7d387721318392289f79d627d1888799a3cfc3de))
* **ddd-kit:** name event handlers and deliver per handler ([0d5cf09](https://github.com/axelhamil/clean-stack/commit/0d5cf092bec65aefbdf94300977212df2587423e))
* **developers:** stack the event catalog with a flex gap ([3502df1](https://github.com/axelhamil/clean-stack/commit/3502df159f35d569725f229f984ab4786239e83f))
* **drizzle:** share the database url guard between both pools ([7cc17f4](https://github.com/axelhamil/clean-stack/commit/7cc17f40ef2c611e99d3de6962326b0d2f60f3b4))
* **emails:** build the digest subject once and name the package exports ([a8e8939](https://github.com/axelhamil/clean-stack/commit/a8e8939e664b5b92026d7e50870e9a91d0d166b4))
* **events:** declare api token revocation reasons once ([b8d4389](https://github.com/axelhamil/clean-stack/commit/b8d43895f8b2c4ceacf13a670b96b14c0c079216))
* **i18n:** replace em dashes in en and fr copy with plain punctuation ([a47dba6](https://github.com/axelhamil/clean-stack/commit/a47dba6a6d37064fe902858f8bd265c989681cde))
* **jitter:** drop the process-clock retry helpers ([5761271](https://github.com/axelhamil/clean-stack/commit/5761271ea231cb3d5da5b805a854a36fb6ea957e))
* **legal:** build policy docs from one helper and trim table markup ([28cd92a](https://github.com/axelhamil/clean-stack/commit/28cd92a674ef75c9ad10e16d6e2bbf204c925f3b))
* **organization:** guard member roles instead of casting them ([ce0cf94](https://github.com/axelhamil/clean-stack/commit/ce0cf943d2d6620b21d0e8ba06873c8abd0b6f4a))
* **outbox:** run audit, webhook and notification fan-out as named handlers ([7268902](https://github.com/axelhamil/clean-stack/commit/72689023628d2972b1923c78359c8e5ec3763390))
* **outbox:** share lease sql fragments and failure schedule ([f024e29](https://github.com/axelhamil/clean-stack/commit/f024e293a85c7657444ef16c852c012377124282))
* **policies:** carry the acceptance ip as an option in the store port ([1cf9d54](https://github.com/axelhamil/clean-stack/commit/1cf9d54bade12492ff24195eb351a2290d73e858))
* **privacy:** render the privacy card lists with the shared list rows ([f2e5359](https://github.com/axelhamil/clean-stack/commit/f2e5359e2cac6ecce6f4453fa8fff17a549ed2a8))
* **quotas:** share the usage row filter across quota store reads ([f4fae41](https://github.com/axelhamil/clean-stack/commit/f4fae41ecd2cf5ff82bba04e7dbe084c325472d0))
* **rgpd:** load deletion state and purge user objects in one place ([9e756ab](https://github.com/axelhamil/clean-stack/commit/9e756ab05f9ad1b45904927b59cb445745e82ea2))
* **rgpd:** share the deletion dialog footer and flatten the preflight states ([3a534c2](https://github.com/axelhamil/clean-stack/commit/3a534c248a18287e9a1f698096cfd20020bd526d))
* **router:** render pathless gates as bare outlets ([07ae823](https://github.com/axelhamil/clean-stack/commit/07ae8236bf0bdc0e53cf34d1608abed9af56a5c5))
* **security:** flatten passkey error branches and name the device label ([672fb9e](https://github.com/axelhamil/clean-stack/commit/672fb9e1f346e98c0ba9430bebc147e9a8328981))
* **sso:** narrow the provider tab value instead of casting it ([6c39616](https://github.com/axelhamil/clean-stack/commit/6c3961688818747f01e3894ec7c8a2629b905a12))
* **ui:** add a compact initials avatar for organizations ([c475738](https://github.com/axelhamil/clean-stack/commit/c47573804c8fbabc5ae811004be776d4a9be15ca))
* **ui:** cover inline muted and mono text with primitives ([7eb3ff6](https://github.com/axelhamil/clean-stack/commit/7eb3ff610fb35993fa0e5f9c4fca1e7485a04307))
* **ui:** drop the prose margins paragraphs and lists had to cancel ([b093f97](https://github.com/axelhamil/clean-stack/commit/b093f9797e1849b8db9a3ea97f2c482c5c3ff3b2))
* **ui:** give a list row one clickable content slot ([932a4b7](https://github.com/axelhamil/clean-stack/commit/932a4b76faa8224a9b2abdb4a5d2a2c3b67529a8))
* **ui:** give command items a hint slot ([3809d44](https://github.com/axelhamil/clean-stack/commit/3809d44788c86967a6abb87ee821017bbe793757))
* **ui:** let a checkbox field carry a label with inline links ([a654b76](https://github.com/axelhamil/clean-stack/commit/a654b767d892601a14327c105089b296c7b220cc))
* **ui:** pin the cookie banner through a bottom banner primitive ([e7b4233](https://github.com/axelhamil/clean-stack/commit/e7b4233656cb2c4ff2fafc5d13cf5c3a85f0b5c0))
* **ui:** render label and value pairs as a description list ([cd891fd](https://github.com/axelhamil/clean-stack/commit/cd891fd34925cc3e3edd7347b66a2ec5c945acd4))
* **uow:** join nested runs to the ambient transaction ([aa7c1da](https://github.com/axelhamil/clean-stack/commit/aa7c1da7835ccff24d86d1dabcedd933e607b35f))
* **uow:** remove the transaction parameter from ports and repositories ([c5a4439](https://github.com/axelhamil/clean-stack/commit/c5a4439ece69136691d05b7618cb9d4785873555))
* **uow:** roll back a run that raised events nobody can persist ([1914d19](https://github.com/axelhamil/clean-stack/commit/1914d195ce0838b466afca0408bea8d1a940e405))
* **uow:** run better-auth transactions as their own outermost unit ([f5b0764](https://github.com/axelhamil/clean-stack/commit/f5b07646644328c935d2b5a3026761d1a2ba019b))
* **uploads:** check key ownership through one guard ([d1a9d05](https://github.com/axelhamil/clean-stack/commit/d1a9d0577b3fd04eddaadd2a655a253049e7a7e9))
* **uploads:** default the presign ttl bounds in the env schema ([4282555](https://github.com/axelhamil/clean-stack/commit/428255512178fcddaa88d13bc363e5a473fdf1d8))
* **webhooks:** drive delivery badges and filters from the status lookups ([7585c3a](https://github.com/axelhamil/clean-stack/commit/7585c3a4a9da9fba7b50024636c11647d28fe094))
* **webhooks:** validate event types with one shared schema ([6545545](https://github.com/axelhamil/clean-stack/commit/6545545da4ab3fa749469a38bd970457985cf4b2))

### Build

* **deps:** load the drizzle env files with dotenv 18 ([ca2ed2f](https://github.com/axelhamil/clean-stack/commit/ca2ed2fc1f6b033cdce58beab18581d9a6239b13))
* **deps:** move @hookform/resolvers to 6 ([003087b](https://github.com/axelhamil/clean-stack/commit/003087bbe5478aa66c8d89ed54aad5be6dfabb80))
* **deps:** move @sentry/vite-plugin to 11 ([1c380f1](https://github.com/axelhamil/clean-stack/commit/1c380f13fa9c800b2348031c99979006474b9bd9))
* **deps:** move inwire to 4 ([e2354ff](https://github.com/axelhamil/clean-stack/commit/e2354ff624d9402bcb93b2c7499716121dc3b1db))
* **deps:** move sentry to v11 without letting it start collecting pii ([3e2fc4d](https://github.com/axelhamil/clean-stack/commit/3e2fc4dd4086f6e9e248b1da95cc598b7ecdbfe5))
* **deps:** move stripe to 23 ([c2ea1d1](https://github.com/axelhamil/clean-stack/commit/c2ea1d1fb20f0e615e234d631a45c132b868f332))
* **deps:** move to node 26 lts, bun 1.4.4 and pnpm 12 ([8c443c6](https://github.com/axelhamil/clean-stack/commit/8c443c6fd8f4b8cb9f0b0c75ad19c1b6ac148b36))
* **deps:** move tsup to 9 ([196a62d](https://github.com/axelhamil/clean-stack/commit/196a62dfb7612a4a3514d014337d8731247a66af))
* **deps:** pick up the latest hono and aws sdk patch releases ([235e5ce](https://github.com/axelhamil/clean-stack/commit/235e5ce40e6c3b54548771f69c1d30fd149bd5c2))
* **deps:** pick up the latest minor and patch releases ([9b07bc6](https://github.com/axelhamil/clean-stack/commit/9b07bc6ffbbdaada907d3fe1f08a19f548a71dda))
* **deps:** refresh every workspace to the newest in-range releases ([c081d81](https://github.com/axelhamil/clean-stack/commit/c081d8118ab67e505ce363e169ada03faeadae94))
* **deps:** run every vitest suite on vitest 5 ([7c6e131](https://github.com/axelhamil/clean-stack/commit/7c6e1316274c6725e9043d9995b1b9b84247c63f))

### Documentation

* **api:** bring the shared inventory and billing listing up to date ([4ad8f5f](https://github.com/axelhamil/clean-stack/commit/4ad8f5f1ff9e2c55db1a2562e249afc4ff6cde53))
* **claude:** bring the seven claude.md files back to the as-built state ([dbaa51a](https://github.com/axelhamil/clean-stack/commit/dbaa51a7de6087f95a121afc6177e426a87e1786))
* **claude:** drop the em dashes from the agent-facing guides ([f23d8f8](https://github.com/axelhamil/clean-stack/commit/f23d8f8a7b2bff4873dedcaa0bc92fa6a9cfb451))
* **claude:** one guide per app and per package ([143c52c](https://github.com/axelhamil/clean-stack/commit/143c52c8a4a3b3cdb4fa05969600f9d4fce36aaa))
* document the lease model for email and webhook queues ([b8718d4](https://github.com/axelhamil/clean-stack/commit/b8718d4610729ab50ceeef2151ab4befcc7d9b9c))
* drop the em dashes from every guide, inventory and roadmap ([12ea3ce](https://github.com/axelhamil/clean-stack/commit/12ea3ceaefd902837f723aa177e3ed7e156ad93e))
* **features:** point the legal body selection at policies/bodies.ts ([b4be41a](https://github.com/axelhamil/clean-stack/commit/b4be41a4e260408cfbfdde6f5bf3481ac35e8ee7))
* **outbox:** document lease delivery, handler names and dead replay ([6145f00](https://github.com/axelhamil/clean-stack/commit/6145f00856debec762ea6a4f8a86056cc6ea8ac1))
* **readme:** correct the clone and deploy path ([36a0dbe](https://github.com/axelhamil/clean-stack/commit/36a0dbe6a965d523b9574a0fa1653a4ecfee030b))
* record the better-auth 1.7 move and the three remaining pins ([babb176](https://github.com/axelhamil/clean-stack/commit/babb176aef03a196ebfea9814c598b5dabc2441c))
* record the october 2026 dependency refresh ([9dbcbb3](https://github.com/axelhamil/clean-stack/commit/9dbcbb3101de4480d19308523dfcbba207778d2f))
* refresh event totals and the list of what is left ([bfb8a78](https://github.com/axelhamil/clean-stack/commit/bfb8a78f806a9f5488422c3524f457288c01342a))
* **roadmap:** add the openup resync phase and make every phase follow one shape ([6b8476a](https://github.com/axelhamil/clean-stack/commit/6b8476ab8cf41ab0e2751dce1439b8c619e72e58)), closes [#70](https://github.com/axelhamil/clean-stack/issues/70)
* **roadmap:** add the standalone back office as phase k ([7818e77](https://github.com/axelhamil/clean-stack/commit/7818e7706128ec93cae82b20d95b086d4d7b2cca))
* **roadmap:** mark the review pass delivered ([1d3c944](https://github.com/axelhamil/clean-stack/commit/1d3c9442ffe7364929d86ceb08c9954f876f5d62))
* **roadmap:** plan a front redesign from scratch before the review pass ([1d729a1](https://github.com/axelhamil/clean-stack/commit/1d729a1285007790f943fc7ec387fe876c9b1cc0))
* **roadmap:** record the post phase k follow-ups and what stays open ([f873f6e](https://github.com/axelhamil/clean-stack/commit/f873f6e6bff6558528a6209f991b1cd6ac61eaa6))

## [1.24.1](https://github.com/axelhamil/clean-stack/compare/v1.24.0...v1.24.1) (2026-09-01)

### Refactor

* **ui:** promote the three surfaces features kept redrawing by hand ([1b2fc4b](https://github.com/axelhamil/clean-stack/commit/1b2fc4ba72c7b75f8e339ae3a45eff4aa9722580))

## [1.24.0](https://github.com/axelhamil/clean-stack/compare/v1.23.0...v1.24.0) (2026-09-01)

### Features

* **a11y:** gate wcag 2.1 aa in ci and fix seven violations ([27fb0e3](https://github.com/axelhamil/clean-stack/commit/27fb0e3dda9d5a10d8581e188ac8e22874f16e39))
* **access-control:** resolve capability to role list ([61cf908](https://github.com/axelhamil/clean-stack/commit/61cf9082896b0237564420898a80b65e68c88660))
* **admin:** allow changing an account role from the admin ui ([4374604](https://github.com/axelhamil/clean-stack/commit/4374604ce2d5edb811f0419ecd78c5ce8b17227e))
* **admin:** let a platform admin or org owner change sso enforcement ([2079774](https://github.com/axelhamil/clean-stack/commit/2079774f0987c773b735f7180e16560266fababf))
* **api-token:** add api_token table and pepper configuration ([1b65c27](https://github.com/axelhamil/clean-stack/commit/1b65c27f7c7f3e86033003cc241536fb1df0afb9))
* **api-token:** add api-token auth middleware and rate-limit policies ([1879638](https://github.com/axelhamil/clean-stack/commit/1879638d881af3ac950504a00c5adf765b9ba291))
* **api-token:** add opt-in /api/v1 public surface disjoint from sessions ([52161fc](https://github.com/axelhamil/clean-stack/commit/52161fc8347837f5f8fe87df674ac72adb569d1d))
* **api-token:** add repository port and drizzle implementation ([23e1a12](https://github.com/axelhamil/clean-stack/commit/23e1a1275ed0a6ff76e4b0472382c2a89f2dcdc4))
* **api-token:** add settings/api-tokens management page ([b88ab0a](https://github.com/axelhamil/clean-stack/commit/b88ab0a1e07f55b5ae63125d53f3f9f998f68aa4))
* **api-token:** add settings/tokens crud routes ([fcd14d2](https://github.com/axelhamil/clean-stack/commit/fcd14d29440685f72eae81a4282ef78eeb158605))
* **api-token:** add token format primitives with crc32 checksum ([a0975f5](https://github.com/axelhamil/clean-stack/commit/a0975f5239ed052aaeb2625d7e4c933c3d36054f))
* **api-token:** add token service, di module and access-control statement ([96ce2d0](https://github.com/axelhamil/clean-stack/commit/96ce2d0f9343b1a20e38de5eac60e4431fcf17b7))
* **api-token:** revoke leaked tokens reported by github secret scanning ([98e9a37](https://github.com/axelhamil/clean-stack/commit/98e9a37fd84afd813cf8a7cadcf6e4452a4932ac))
* **api-token:** revoke org tokens when their creator loses membership ([5f48721](https://github.com/axelhamil/clean-stack/commit/5f487216670edefbd95fe037c1dabd52f8ba4b77))
* **api:** add notification store and preference cascade ([ee5e2cf](https://github.com/axelhamil/clean-stack/commit/ee5e2cfe783310581eb97e614a1fd6e813ab8dd5))
* **api:** add pg_notify trigger on notification insert ([862c967](https://github.com/axelhamil/clean-stack/commit/862c9673e67e7122c59c52ef0465a6f48abe0d12))
* **api:** add put /me/locale behind its own module ([23b20bd](https://github.com/axelhamil/clean-stack/commit/23b20bd163a8c6f12a0901d9a164c928ef53b05d)), closes [#8](https://github.com/axelhamil/clean-stack/issues/8)
* **api:** add the back-front surface map and its parity gate ([45437b5](https://github.com/axelhamil/clean-stack/commit/45437b537d077edd7961260fa894fd1f6c855730))
* **api:** add the sweep rail's per-request span facade ([639c87e](https://github.com/axelhamil/clean-stack/commit/639c87ee835da8152426c704b4e63ab72c8cfd59))
* **api:** emit a domain event when notifications are marked read ([22f6e95](https://github.com/axelhamil/clean-stack/commit/22f6e9573285fed3d9cc352294bfd2ba98c83559))
* **api:** enforce policy acceptance server-side on business routes ([dd6b07d](https://github.com/axelhamil/clean-stack/commit/dd6b07d5904e8971fc67bc088e9452738ebfbab6))
* **api:** expose notification inbox and preference routes ([c7d0b07](https://github.com/axelhamil/clean-stack/commit/c7d0b07c2533d13fe50ea37757c0dc5731a7734f))
* **api:** extract front-end api client call sites ([0edb6e5](https://github.com/axelhamil/clean-stack/commit/0edb6e57aed880d3e328a1241e4dbba48203d193))
* **api:** extract the live back-route table ([b334b16](https://github.com/axelhamil/clean-stack/commit/b334b1618746a3883dc9939ff2fde0aa28aa4702))
* **api:** fan out notifications from the dispatch transaction ([57b36dd](https://github.com/axelhamil/clean-stack/commit/57b36ddd7ac14e47fb76466078f6abd71aada519))
* **api:** flush batched notification emails from cron ([d6b64dd](https://github.com/axelhamil/clean-stack/commit/d6b64dd164fae257ee2760c74bf08909a9e18ea6))
* **api:** honour the email frequency the notification selector promises ([ea8f787](https://github.com/axelhamil/clean-stack/commit/ea8f7876257333cb9341ee312c21bca1467121f4))
* **api:** let instrumentation write attributes on the active span ([f702a2a](https://github.com/axelhamil/clean-stack/commit/f702a2a42fde6fc90d84102c5b6006ac1d70a6b2))
* **api:** make each sweep single-flight with a lease ([d57dc8a](https://github.com/axelhamil/clean-stack/commit/d57dc8abcc87ad32b224a01965b9f0003b8a77b9))
* **api:** resolve notification audience from capability ([36ddadd](https://github.com/axelhamil/clean-stack/commit/36ddadda0ffd4793b074f151826e519da67a22fb))
* **api:** stream notification signals over sse ([48e379d](https://github.com/axelhamil/clean-stack/commit/48e379d9724605f841270aa36fde83086b633909))
* **api:** sweep read notifications past retention ([e584ce2](https://github.com/axelhamil/clean-stack/commit/e584ce292fcf63c1aeabdd29edadfb48a0e9cde8))
* **api:** trace each sweep run and pass, and stop swallowing batch errors ([5ffb33f](https://github.com/axelhamil/clean-stack/commit/5ffb33fb775dcf64ead8eedb4cb51bfe2e71429f))
* **api:** trace the sweep lease acquire and release ([6d3c01a](https://github.com/axelhamil/clean-stack/commit/6d3c01aee348157677ab35dc15ca3625692ea003))
* **app:** add notification bell to the app shell ([f295ab9](https://github.com/axelhamil/clean-stack/commit/f295ab965165195a8cd22c5f58673204c9a5c51e))
* **app:** add notification preferences page and org defaults card ([354f11b](https://github.com/axelhamil/clean-stack/commit/354f11bb2110e57da6f3b0cbcab4909c469243e7))
* **app:** add notification queries and mutations ([08ade3f](https://github.com/axelhamil/clean-stack/commit/08ade3f30e6a99c680d0ea3dda1cbbb0630fcd31))
* **app:** add notification queries and mutations ([36fe208](https://github.com/axelhamil/clean-stack/commit/36fe208cb4f84498f1f687bbd87b3ce6b24a07d1))
* **app:** add the admin namespace and translate the user admin screens ([55e897a](https://github.com/axelhamil/clean-stack/commit/55e897aadf2a06a9187f7c3894bc57b9b31ba6a7))
* **app:** add the language switcher and reconcile the locale with the session ([657ebf9](https://github.com/axelhamil/clean-stack/commit/657ebf9325bcd5eb5ab2b85999fc2b39cf90ddaa))
* **app:** consume notification signals over sse ([892f456](https://github.com/axelhamil/clean-stack/commit/892f456bf1c2ee982b238efd95de11e50dc7ff05))
* **app:** disable impersonation-forbidden actions instead of failing on click ([a551320](https://github.com/axelhamil/clean-stack/commit/a551320e2cce33f5919f2e212b96a314e589d01d))
* **app:** give legal pages per-locale content modules and translated chrome ([d683e39](https://github.com/axelhamil/clean-stack/commit/d683e39349d67ca6b181fee6903780696f534c2f))
* **app:** give the policy refusal a business code and a way out ([4975157](https://github.com/axelhamil/clean-stack/commit/4975157b775418f6d1f21dc939ab7d01e17fe4aa))
* **app:** guard schema i18n keys and translate the shared request fallbacks ([08045ac](https://github.com/axelhamil/clean-stack/commit/08045ac8a6728f187120ffd3df34cd53c4d8fb1c))
* **app:** load more history in the notification panel ([fdc367a](https://github.com/axelhamil/clean-stack/commit/fdc367a4241eb74253b60eaae75367773a90b756))
* **app:** localize api, auth and validation messages ([ac57222](https://github.com/axelhamil/clean-stack/commit/ac572223b20ee5c5f5b2ae301e90c72dbd6c465a))
* **app:** resolve the locale at boot and keep html lang honest ([007a9c6](https://github.com/axelhamil/clean-stack/commit/007a9c6552a42e1a9e039f7f5b9ed2b6cd7a7302))
* **app:** translate billing and format prices through intl ([90b1302](https://github.com/axelhamil/clean-stack/commit/90b1302a3a59b3a6f65e69740bcb2157fa0b86eb))
* **app:** translate the api tokens settings screen ([f256ad9](https://github.com/axelhamil/clean-stack/commit/f256ad9db65a878156ba4ce0cd21247406ccd534))
* **app:** translate the auth, account and shell surfaces ([f55e157](https://github.com/axelhamil/clean-stack/commit/f55e157c97b0c3b0f7e386013ad5605d2560a2c4))
* **app:** translate the cookie consent surfaces ([295f7ea](https://github.com/axelhamil/clean-stack/commit/295f7ea8bc60043b3ec1089e39eb48ed3c409599))
* **app:** translate the dashboard, org creation and invitation screens ([a28083a](https://github.com/axelhamil/clean-stack/commit/a28083adab05a2ff628572886287a96d2fbbc524))
* **app:** translate the notification preference screen ([4732f06](https://github.com/axelhamil/clean-stack/commit/4732f0678eedb9bb3b54dc82fed1c3368af99e8b))
* **app:** translate the org admin and audit log screens ([31bf02a](https://github.com/axelhamil/clean-stack/commit/31bf02ae106024909c42ef009ebcb00c8f5438cf))
* **app:** translate the organization forms and danger zone ([01b3b97](https://github.com/axelhamil/clean-stack/commit/01b3b97ec8c31a4d40915e00e173dcf49fd82735))
* **app:** translate the organization members and invitations surface ([674eda9](https://github.com/axelhamil/clean-stack/commit/674eda950173d9c6efe0156c26d73794b62d1116))
* **app:** translate the privacy settings screen end to end ([084ed1d](https://github.com/axelhamil/clean-stack/commit/084ed1d2359f7a12601631ecc5b105f762391b14))
* **app:** translate the shell chrome shared across every screen ([4fc336f](https://github.com/axelhamil/clean-stack/commit/4fc336fa439c17a226391d65cbf1d84d8744ed12))
* **app:** translate the sso settings screen ([cb0ba7c](https://github.com/axelhamil/clean-stack/commit/cb0ba7cf2785853f995139a651657ccb37936fd6))
* **app:** translate the webhook forms and delivery detail ([d39c31d](https://github.com/axelhamil/clean-stack/commit/d39c31dde6ace508035bcc55a2fe7422d300748b))
* **app:** translate the webhooks list and delivery tables ([54407d8](https://github.com/axelhamil/clean-stack/commit/54407d8b602da9aa2c290c9dab65395c32f5a383))
* **db:** store a locale on the user and on each queued email ([e26fe95](https://github.com/axelhamil/clean-stack/commit/e26fe951c516e109a67213cbf765ad8f3b25a6fb))
* **drizzle:** add notification and notification_preference tables ([62c8f33](https://github.com/axelhamil/clean-stack/commit/62c8f332bcc1231b938cf39d2475cc37ee268fa7))
* **emails:** localize per recipient and freeze the locale at enqueue ([7495b6c](https://github.com/axelhamil/clean-stack/commit/7495b6c85b5065e43db2995aba407b4815eeed58))
* **emails:** translate the bodies, not just the subjects ([d1ee79f](https://github.com/axelhamil/clean-stack/commit/d1ee79f79683d9a6c61b22221292387865062317))
* **events:** add api_token created, revoked and used events ([5380d41](https://github.com/axelhamil/clean-stack/commit/5380d414375ef51fcfa3dea85092590df3f1c058))
* **events:** add notification map projecting the catalog onto the inbox ([2c49f2e](https://github.com/axelhamil/clean-stack/commit/2c49f2ea126bd8d9d7c0f4a61872ef3a1c5bcc1c))
* **events:** add preference audit events (catalog 65 -> 67) ([193b34d](https://github.com/axelhamil/clean-stack/commit/193b34d393b05762ab523dd07b670c91bfaad17b))
* **events:** add thirteen sso and scim event types ([5ff52f1](https://github.com/axelhamil/clean-stack/commit/5ff52f10fb5b0ee0492d519c34fcf6654cf5d1c0))
* **events:** add user.locale.changed ([67ad13e](https://github.com/axelhamil/clean-stack/commit/67ad13eccd13d233f061302ceeee2300cf797f36))
* **events:** curate the public catalog behind an explicit visibility map ([82d38e8](https://github.com/axelhamil/clean-stack/commit/82d38e88b63577de5f671340eb7929f72b00187f))
* **i18n:** add the i18n package with locale resolution ([bac1528](https://github.com/axelhamil/clean-stack/commit/bac1528ca14c24bb9a0116e687d09b278b943551))
* **i18n:** add typed en/fr catalogs and the parity gate ([541f1c2](https://github.com/axelhamil/clean-stack/commit/541f1c29f7e6e4423da1f34a38d536dc8ff19b42))
* **i18n:** key the plugin error codes and the field-specific validation copy ([59977bd](https://github.com/axelhamil/clean-stack/commit/59977bdfeacfde9177fc8f195c79ea99b1fc835a))
* **i18n:** translate the remaining account settings cards ([223a108](https://github.com/axelhamil/clean-stack/commit/223a1082a6fa45cf42c5ad67b8ce9a4bf772f1f5))
* **scim:** emit connection and provisioning events with the integration owner as actor ([064bb12](https://github.com/axelhamil/clean-stack/commit/064bb12dfedb26f073fecb41a3d3bd2950089c81)), closes [#6](https://github.com/axelhamil/clean-stack/issues/6)
* **sso:** add sign-in entry and ship c7 ([60e4346](https://github.com/axelhamil/clean-stack/commit/60e4346ce6ca4517c69bdf47db443839524df64f))
* **sso:** add the domain-based sso enforcement predicate ([3ede4a3](https://github.com/axelhamil/clean-stack/commit/3ede4a314073bedee41689531bd269241021a5ca))
* **sso:** add the sso and scim settings page ([bceffba](https://github.com/axelhamil/clean-stack/commit/bceffbabed1def5e94c18f2451bde04b570eec43))
* **sso:** emit provider lifecycle and login events through the auth bridge ([5921e80](https://github.com/axelhamil/clean-stack/commit/5921e806f5bb13895c63b7807c17ef077da5c583))
* **sso:** force sha256 and signed assertions on saml provider registration ([3729865](https://github.com/axelhamil/clean-stack/commit/372986586e26f6a7cca0673eac415c7dbfdd3b95))
* **sso:** gate provider registration on the business tier and block it under impersonation ([006aeff](https://github.com/axelhamil/clean-stack/commit/006aeffb2a6157092f7083cc64a3fa2158e6d0c1))
* **sso:** mount sso and scim plugins with observed path constants ([22ff7d9](https://github.com/axelhamil/clean-stack/commit/22ff7d9b48efe3f2c799e4d23fc21c8af995ae63))
* **sso:** own sso schema file and add organization sso enforcement flag ([f0e2ca6](https://github.com/axelhamil/clean-stack/commit/f0e2ca6844439f4ec33b29073b9aaf43f3257315))
* **sso:** reject non-sso sign-in on enforced domains across all four paths ([316f295](https://github.com/axelhamil/clean-stack/commit/316f295041ed62b3734f0581a01753093703f9cf))

### Bug Fixes

* **api-token:** deny impersonated sessions on write routes ([a160996](https://github.com/axelhamil/clean-stack/commit/a160996b02c8e641db8c7f7565c627532f12cae7))
* **api-token:** harden scope guard and test real pipeline in boundary tests ([6aaa905](https://github.com/axelhamil/clean-stack/commit/6aaa9057e6c5e386de44cc936237a18420b7bc74))
* **api-token:** rehash after validity checks, pepper version from config ([6373ed8](https://github.com/axelhamil/clean-stack/commit/6373ed8aab50bf295b32c1b66544f049855f5098)), closes [#1](https://github.com/axelhamil/clean-stack/issues/1) [#2](https://github.com/axelhamil/clean-stack/issues/2)
* **api-tokens:** three qa defects from branch review ([58d91a4](https://github.com/axelhamil/clean-stack/commit/58d91a4de4fcb823ba1c93202b0121a5f5b364c2))
* **api-token:** stop leaking moderation and billing fields on /api/v1/me ([d396037](https://github.com/axelhamil/clean-stack/commit/d396037daa205ff6775684ebb27fc531798050e6))
* **api-token:** turn key-fetch errors into refusals and fix verify span op ([c342689](https://github.com/axelhamil/clean-stack/commit/c342689be6faf5165a0f5accf3d2111fa7b96674))
* **api-token:** type the revoke mock return so tsc accepts the scanning test ([d6aca1b](https://github.com/axelhamil/clean-stack/commit/d6aca1b03f940a3726eaeee3a12a6f9fd756cf36))
* **api:** add owneruserid to actor audience resolution priority chain ([2d48a20](https://github.com/axelhamil/clean-stack/commit/2d48a20d95c31f99529dac4712e5b7bffb8985af))
* **api:** answer not-found when a read targets someone else's notification ([37d4638](https://github.com/axelhamil/clean-stack/commit/37d4638b48ded9852530d9db46b15ecc5670e7b9))
* **api:** assert the digest invariant, not the scheduling that produced it ([271edbf](https://github.com/axelhamil/clean-stack/commit/271edbf82df314ef4a0510bb690d0df47f8d455f))
* **api:** bound the dry-run count and report truncation from every sweep ([6630192](https://github.com/axelhamil/clean-stack/commit/66301921ff75813c8824ac9c5c16e9a450d31a2c))
* **api:** bound the retention sweep with a wall-clock budget ([be95b30](https://github.com/axelhamil/clean-stack/commit/be95b30cd909f40ad64613cfb3adab21aa97d900))
* **api:** choose what a notification payload sends to the browser ([ab777df](https://github.com/axelhamil/clean-stack/commit/ab777dfd4f14f45377973f77f936d7d66d162fd2))
* **api:** close six pre-merge findings on the sweep instrumentation rail ([242677a](https://github.com/axelhamil/clean-stack/commit/242677a973df26418ae00fe06a1387ab4d8e5920))
* **api:** close the rgpd-sweep race and harden the standalone cron ([60492db](https://github.com/axelhamil/clean-stack/commit/60492db5b0409da41fcca0c8ec1045f66fa5fe9c))
* **api:** cover remaining hand-rolled instrumentation doubles ([e9213f1](https://github.com/axelhamil/clean-stack/commit/e9213f147cb8741bb59aae773ae979d7bda8316b))
* **api:** emit the locale change inside the write transaction ([59d1709](https://github.com/axelhamil/clean-stack/commit/59d170940f5d88ec8aa461b88286aeade3adbe6d))
* **api:** extend the cron's anti-starvation fix to every per-route failure ([0d231d5](https://github.com/axelhamil/clean-stack/commit/0d231d52e172795841a969891003217af3fd25be))
* **api:** fail enqueue when every row is suppressed ([061b8b3](https://github.com/axelhamil/clean-stack/commit/061b8b329e5a09d4060857d485cc92090a156802))
* **api:** fence the sweep lease by owner and use timezone-aware timestamps ([24706d5](https://github.com/axelhamil/clean-stack/commit/24706d5685b2a399f0662f5dee331fe1a61633b7))
* **api:** gate org-preferences reads with org permission check ([521509f](https://github.com/axelhamil/clean-stack/commit/521509f641795da56a879b5e89ee1571b710000d))
* **api:** gate uploads and make the policy-gate documentation exact ([3aa9f56](https://github.com/axelhamil/clean-stack/commit/3aa9f568cb8668b2f03b99299d6426dc3ac14d23))
* **api:** give a validation rejection an error code ([a7074cc](https://github.com/axelhamil/clean-stack/commit/a7074cc677d1271709c5081c5f509bc18eab6005))
* **api:** give the rgpd wipe sweep a time budget ([4617b6c](https://github.com/axelhamil/clean-stack/commit/4617b6cd31a2b1c723418ef389c9d2664190d5a4))
* **api:** give the sweep lease its own unbudgeted span path ([d7073ea](https://github.com/axelhamil/clean-stack/commit/d7073ea6174832e0c0ede20c9083c63eaf176dac))
* **api:** guarantee stream unsubscribe and log sse write failures ([25bd46c](https://github.com/axelhamil/clean-stack/commit/25bd46c7c2025b4376204fda062e7040af22ade1))
* **api:** guard check-sweep-lock against a non-local database ([3dfc47b](https://github.com/axelhamil/clean-stack/commit/3dfc47bc097e4f0f8028240f6bdd40c14eca0568))
* **api:** guard email check scripts against a non-local database url ([7668bbb](https://github.com/axelhamil/clean-stack/commit/7668bbb75aee9a49d1f51b11747d32e8104594bc))
* **api:** hash idempotency key to stay under pg index 8191-byte limit ([505dcc4](https://github.com/axelhamil/clean-stack/commit/505dcc412f8141dafed9ef0da8636ec4687973a1))
* **api:** honour a preference flipped after a digest was scheduled ([7d86ed5](https://github.com/axelhamil/clean-stack/commit/7d86ed54d89ba54f5399b06df4e5cb4a95c138c5))
* **api:** keep internal-route signing fail-closed by default ([b8fa8e3](https://github.com/axelhamil/clean-stack/commit/b8fa8e3a96cacfb3c6d0414b5b0bfb6b20fff686))
* **api:** make check:fanout actually fail on a broken assertion ([2273033](https://github.com/axelhamil/clean-stack/commit/22730338a567e8f7417ce891e0e288f2a81321bd))
* **api:** make check:fanout run on a fresh clone and drop the hardcoded address ([4872078](https://github.com/axelhamil/clean-stack/commit/48720789a77d10eeae2b9f4ca7501163a89b0f04))
* **api:** match __tests__ case-insensitively in front consumer scan ([ab35548](https://github.com/axelhamil/clean-stack/commit/ab35548885ab86bb439f79177590429221848977))
* **api:** record run-level attributes on skipped and completed sweeps ([cc40b00](https://github.com/axelhamil/clean-stack/commit/cc40b009d2897e5ccdfe4a7ef3d8cbfb2d27a746))
* **api:** reject the .env.example placeholder secrets in production ([9bc076f](https://github.com/axelhamil/clean-stack/commit/9bc076fd9ff25daa78d1845908eed9c7fbc6b49b))
* **api:** remove cross-file mock.module leak in sweep-email-messages test ([827df48](https://github.com/axelhamil/clean-stack/commit/827df48374eb9756f1c4fd844350cc7ee315e680))
* **api:** report processed as accounts actually attempted under truncation ([140dc3a](https://github.com/axelhamil/clean-stack/commit/140dc3aa053c84f11490400411d102b86863c436))
* **api:** resolve each digest page in place instead of accumulating ids ([834aaa9](https://github.com/axelhamil/clean-stack/commit/834aaa920c5722e1f4cb13a59a50f39af6bd4a7d))
* **api:** set an explicit idle timeout on the http server ([14c2791](https://github.com/axelhamil/clean-stack/commit/14c2791d60cad28609dfa9fa546bd8ec4d41dedc))
* **api:** show personal api tokens in their owner's list ([6a6130d](https://github.com/axelhamil/clean-stack/commit/6a6130dd3d6e399c39e94b12b1185e3c30b43289))
* **api:** signal the read transition so the unread badge converges everywhere ([452daaf](https://github.com/axelhamil/clean-stack/commit/452daafadf2851a0c6e98cf799f647432a0b248f))
* **api:** stop the notification stream hub multiplying its listen connections ([a879d54](https://github.com/axelhamil/clean-stack/commit/a879d541302464ad4e74db6eb7c0bc425bf876d7))
* **api:** stop the outbox dispatcher multiplying its listen connections ([c309a79](https://github.com/axelhamil/clean-stack/commit/c309a79c0c68c441a15892a8016ce6aff0535408))
* **api:** surface notification stream hub failures to telemetry ([9a2d1e4](https://github.com/axelhamil/clean-stack/commit/9a2d1e4b3d024d34a34bee123f47ee6461087ba1))
* **api:** time-bound signed internal calls and the sweep cron ([f12cb54](https://github.com/axelhamil/clean-stack/commit/f12cb5472804d97262398ffde02831845ffcdfe7))
* **api:** warn when the cron's timeout override is invalid ([1320c1f](https://github.com/axelhamil/clean-stack/commit/1320c1fe1b23c837ce2d58ee7885d121ff352f42))
* **api:** write a notification preference and its event in one transaction ([72a285b](https://github.com/axelhamil/clean-stack/commit/72a285ba9b394cd4f6282cf6a12bbf2cfb70313d))
* **app:** align the shell on the pages it wraps ([c9095d9](https://github.com/axelhamil/clean-stack/commit/c9095d919de0469bb982a6133d06d1dfdb639963))
* **app:** carry the auth client error code through to the toast lookup ([3183687](https://github.com/axelhamil/clean-stack/commit/3183687e9836e2156ee7aec57d3f60344e43b930))
* **app:** close the locale leaks around session and boot boundaries ([0ab6b3f](https://github.com/axelhamil/clean-stack/commit/0ab6b3f2f2ce5d92d008a810a8d840f5ee62fbaa))
* **app:** detect a silent notification stream and reconnect ([f982e92](https://github.com/axelhamil/clean-stack/commit/f982e925ab219cf9b477ec9b8edf544a4e642115))
* **app:** disclose the untranslated body on every legal page ([7813991](https://github.com/axelhamil/clean-stack/commit/78139917be105bddfbb1626953c9d62b2fceb818))
* **app:** format dates in the active locale ([513ba3e](https://github.com/axelhamil/clean-stack/commit/513ba3e5c04d2de3ddb70b0813819d7968348afd))
* **app:** give the data rights link a real accessible name ([ab696c7](https://github.com/axelhamil/clean-stack/commit/ab696c7cd729fa59331b0f81c1f32c77dffaed16))
* **app:** give three pages the landmark and the heading they were missing ([0574f6a](https://github.com/axelhamil/clean-stack/commit/0574f6a5dd8b43c51431a0447801615254e4e609))
* **app:** keep a 4xx server message when the catalog has no copy ([937ec4f](https://github.com/axelhamil/clean-stack/commit/937ec4f1e40c3e23d6822c4041456dd7fb6d5f61))
* **app:** keep legal route components unexported and translate the cookie captions ([751d22c](https://github.com/axelhamil/clean-stack/commit/751d22c326a733bfa392d6af270ca23f510f686f))
* **app:** keep the webhook endpoint dialog inside the viewport ([4793831](https://github.com/axelhamil/clean-stack/commit/4793831107e2b2229aa7487df68c9b44c685903b))
* **app:** key every org-scoped query on the active organization ([a4cc582](https://github.com/axelhamil/clean-stack/commit/a4cc582601fb77fe510164ffd9277ce1850cbbaa))
* **app:** let the global zod map govern validation copy ([c2c42d7](https://github.com/axelhamil/clean-stack/commit/c2c42d76e31ea1b9f4ac0a82c9fb56eeeb015e21))
* **app:** make impersonation freeze reason reachable without a mouse ([7a9f371](https://github.com/axelhamil/clean-stack/commit/7a9f371122082537cc9b9dfe2f2b6adef09ca9fe))
* **app:** make the html-lang assertion falsifiable and boot i18n resilient ([ec087e8](https://github.com/axelhamil/clean-stack/commit/ec087e86a4d3b814d0f3252d22e536e0a57490c7))
* **app:** make the repo satisfy the rule this phase made unconditional ([180745a](https://github.com/axelhamil/clean-stack/commit/180745a107ea64ef78448b4bae2445b968077cb8))
* **app:** mirror the betterauth impersonation blocklist on account and security ([da16f8c](https://github.com/axelhamil/clean-stack/commit/da16f8cb7493a782fecc77679149ea6fa0e10198))
* **app:** prove the notification category mapping and drop its cast ([08a252a](https://github.com/axelhamil/clean-stack/commit/08a252a0f3d3b9d83b18a5e8ea0871f54d47128e))
* **app:** reach the role dialog on an account with no platform role ([6ad9a55](https://github.com/axelhamil/clean-stack/commit/6ad9a55f47d826e6974dc7cc374a8e39a27deacb))
* **app:** reject stale timestamps in the webhook verification example ([b1340e3](https://github.com/axelhamil/clean-stack/commit/b1340e31710af7c025df4ff49aa3445f6a21acf8))
* **app:** render refusals as localized copy instead of raw backend english ([c9d46fb](https://github.com/axelhamil/clean-stack/commit/c9d46fb17141c1a841ee7061b101b09df813a927))
* **app:** resolve remaining refusals through the error catalog ([9e11de4](https://github.com/axelhamil/clean-stack/commit/9e11de47a3d8376eb7e649cd79cdb40e2ccc68b4))
* **app:** restore native broadcast channel semantics and fix tests ([822912d](https://github.com/axelhamil/clean-stack/commit/822912db8a58092596a14fd1daec9a7b2c450182))
* **app:** restore the field-specific validation messages ([9b6ed32](https://github.com/axelhamil/clean-stack/commit/9b6ed32b3f8d9ba8b8087c764ce2c7c8d6b5ac08))
* **app:** restore the specific auth errors and localise the rate-limit toast ([1112bb1](https://github.com/axelhamil/clean-stack/commit/1112bb1d8bcafd78712b1d409069efff25812015))
* **app:** route sso and api-token validation copy back through the catalog ([8ae9485](https://github.com/axelhamil/clean-stack/commit/8ae94851aeb937b29365a9e4047bab928abceb12))
* **app:** scope chosen-locale reset to real identity changes ([0aed9a0](https://github.com/axelhamil/clean-stack/commit/0aed9a03ec4604d32cb1758c392aa2ca76cfb34f))
* **app:** scope the org notification defaults cache by organization ([c885dc2](https://github.com/axelhamil/clean-stack/commit/c885dc23696d3d48545d9b6c2c56ed460b9ef530))
* **app:** stop attributing a freeze to impersonation when something else owns it ([b221f72](https://github.com/axelhamil/clean-stack/commit/b221f72c75a1712b2917f516003194bd0481e604))
* **app:** stop mixing url and path in the fr locale cookie seed ([f90b68d](https://github.com/axelhamil/clean-stack/commit/f90b68d84adb04157af05e7c839e6f96898f3af7))
* **app:** stop the account settings crash and de-duplicate stray i18n keys ([e0cf839](https://github.com/axelhamil/clean-stack/commit/e0cf839b59f25d59076c224938dd3575bb9bb302))
* **app:** stop the language switcher reverting to a stale session locale ([b39c7bd](https://github.com/axelhamil/clean-stack/commit/b39c7bd59c8d6e9aa19a2e08e33d8cf60961d0c1))
* **app:** stop the org notification matrix overflowing its card ([28df99c](https://github.com/axelhamil/clean-stack/commit/28df99c95c95067b92630af2219fc4c77fc3a132))
* **app:** translate the interpolated role and status enums the extraction left raw ([2d9c469](https://github.com/axelhamil/clean-stack/commit/2d9c469ee76c104e9f5cb5f4ff3c4ff30471a553))
* **app:** version the generated route tree so a clean clone type-checks ([d01353b](https://github.com/axelhamil/clean-stack/commit/d01353bfd34c2f2e2a9627d918663e75008cf1a2))
* **db:** declare the two_factor columns better-auth writes ([166d4e1](https://github.com/axelhamil/clean-stack/commit/166d4e16145782c7b8c542a310d42dff5bac0741))
* **db:** generate the migration for the user and email locale columns ([4c37c18](https://github.com/axelhamil/clean-stack/commit/4c37c18a8cfffb372c07a5c709f6a6f4befe0d4c))
* **db:** make sso/scim migration idempotent for pre-existing drift ([ae0eaa4](https://github.com/axelhamil/clean-stack/commit/ae0eaa427b14826ffbdf1f07a5c334c7da56a551))
* **db:** ship the two_factor lockout columns as a migration ([18457c6](https://github.com/axelhamil/clean-stack/commit/18457c67785dba3f484bf47b5e77540d9b2c3713))
* **email:** align the raw batch key separator with the template one ([2b6e77b](https://github.com/axelhamil/clean-stack/commit/2b6e77b837fe3f187750162d704db630f2359592))
* **email:** hash the chunk idempotency key instead of truncating it ([98bc3e0](https://github.com/axelhamil/clean-stack/commit/98bc3e0cc653d24f01cffbb47944983746b2b268))
* **email:** key idempotency per recipient rather than per batch position ([f2198ea](https://github.com/axelhamil/clean-stack/commit/f2198ea22aa209fec23c669eb163fcc4a0adef11))
* **email:** purge failed queue rows on their own retention cutoff ([b6e6c84](https://github.com/axelhamil/clean-stack/commit/b6e6c848a46082d4b2f49e0d8961e90f2c0b7bc6))
* **email:** report the row count enqueue actually wrote ([06f75b1](https://github.com/axelhamil/clean-stack/commit/06f75b1349e0deccb7f0c7df7cda727e1f916b09))
* **emails:** add api_token_leaked stub to render test ([3c2e8fa](https://github.com/axelhamil/clean-stack/commit/3c2e8fa286dcbccf99252c10417061ba5cdf7036))
* **emails:** restore the emphasis on the token and organization names ([642e356](https://github.com/axelhamil/clean-stack/commit/642e356b0213e7cb726a5f5514672e581b1dcff6))
* **emails:** thread recipient locale through auth hooks, digest flush, and i18n fallback ([8bfadfd](https://github.com/axelhamil/clean-stack/commit/8bfadfdc077eda73ca5055f4e3a18bb9f6060b14))
* **emails:** thread the recipient locale through every remaining send site ([64db324](https://github.com/axelhamil/clean-stack/commit/64db32431ad1e7e6fb656984f5f1b67e68823aff))
* **email:** suppress duplicate enqueues instead of failing the batch ([7b5e967](https://github.com/axelhamil/clean-stack/commit/7b5e96717a953f91f04ad6f464751f6f0e4cee9d))
* **events:** type the locale payload against the supported locale set ([6fade98](https://github.com/axelhamil/clean-stack/commit/6fade9800399d4b4186ec5d1110832b84caa65fa))
* **i18n:** align impersonation refusal copy with the emprunt d'identité wording ([5df8252](https://github.com/axelhamil/clean-stack/commit/5df8252e692aa7560507fd6a5e209ea2c987a7ff))
* **i18n:** correct the french a native reviewer found wrong ([54f17e8](https://github.com/axelhamil/clean-stack/commit/54f17e8cf6b21e80439bd3f3df25f92c6ee2203c))
* **i18n:** give the enforce aria-label a determiner in the fr catalog ([c72236e](https://github.com/axelhamil/clean-stack/commit/c72236ece4164b0314abe9a4a76c923e2d7a769b))
* **i18n:** use an invariable french header for the created-at columns ([2fd0416](https://github.com/axelhamil/clean-stack/commit/2fd04164a95f88799d4ff7cf513d0f93e0d7a201))
* **i18n:** use the catalog's established "en tant que" idiom for signed-in-as ([50e6d4e](https://github.com/axelhamil/clean-stack/commit/50e6d4e0793b99e52c107a065ba9ecf2cc99fa2f))
* **i18n:** use the narrow no-break space in the acceptance toast ([47b2b8f](https://github.com/axelhamil/clean-stack/commit/47b2b8fbf60734e51419f89c6d1d2ccefc76d418))
* **notifications:** always set email_pending_at, even for forced events ([4053d5f](https://github.com/axelhamil/clean-stack/commit/4053d5f67662f5beef67b3590c48a4fe83028ecc))
* **notifications:** apply preferences when fanning out notifications ([f0d2fac](https://github.com/axelhamil/clean-stack/commit/f0d2fac5f64394c90b7e044fa0cac78c9d94d041))
* **notifications:** cap flush batch size at 5000 ([90b2588](https://github.com/axelhamil/clean-stack/commit/90b25886f073a62056fb3138adf3b3ac3b71d616))
* **notifications:** guard notification stream hub start against double call ([ee0bc16](https://github.com/axelhamil/clean-stack/commit/ee0bc160e1bc8e1cf1390fc9037fc532bfaa5584))
* **notifications:** return nextcursor in notification list response ([ad4cb2b](https://github.com/axelhamil/clean-stack/commit/ad4cb2b38bedf269b67409781377ec4f2826c9a4))
* **release:** stop a wrapped prose line from cutting a major version ([e4d12b6](https://github.com/axelhamil/clean-stack/commit/e4d12b69c181c62dd882d1dd053e5c7f094dea37))
* **rgpd:** enqueue the deletion confirmation inside the wipe transaction ([025b49a](https://github.com/axelhamil/clean-stack/commit/025b49a6b06395dd19e9abdc42d54bbe2af1552c))
* **rgpd:** only treat the rollback sentinel as a notify failure ([9c49c43](https://github.com/axelhamil/clean-stack/commit/9c49c4313a72fd226854104f2ea6b8a05dc2e81b))
* **scim:** verify the bearer token before the before-hook trusts it ([0e52885](https://github.com/axelhamil/clean-stack/commit/0e52885e22193dc52194033fa41afa22343634d7))
* **security:** tune the global burst window to what a page view costs ([b03b2b3](https://github.com/axelhamil/clean-stack/commit/b03b2b391b1e6adf388b2a86734eb131a0290166))
* **sso:** close review gaps on passkey error body, sso redirect coverage, and a11y flake ([70caa38](https://github.com/axelhamil/clean-stack/commit/70caa3873877311ea5e3ebe59eedf2174890eaab))
* **sso:** close the scim billing bypass and key enforcement on the request ([ad9056c](https://github.com/axelhamil/clean-stack/commit/ad9056cee5abd4b2817736ae64edbcc4d2155460))
* **sso:** fail-closed rate limit for send-verification-email ([8f5d500](https://github.com/axelhamil/clean-stack/commit/8f5d500c15b4250444ecfce0aad368b39128e11e))
* **sso:** gate the business tier on the request's target org, not session history ([8fa4e41](https://github.com/axelhamil/clean-stack/commit/8fa4e41391e2432d30d34d78a6d590f55a16184c))
* **sso:** normalize domain casing on both write and read paths ([dc66185](https://github.com/axelhamil/clean-stack/commit/dc66185fc4b65b1757b4f0d8184253575947a4d2))
* **sso:** normalize domain casing on the update-provider write path too ([d867c5a](https://github.com/axelhamil/clean-stack/commit/d867c5a23c21d503b7d2f157fb8cfdcb842065e6))
* **sso:** normalize saml config on the update path, not just at registration ([0e65850](https://github.com/axelhamil/clean-stack/commit/0e65850b9dafc25363746ac038bb8ee804d35345))
* **sso:** redirect the passkey legs into sso instead of dead-ending ([bb6b120](https://github.com/axelhamil/clean-stack/commit/bb6b120b212917f1dbe7473f3200b113156b4c34))
* **sso:** reject the whole sha1/md5 algorithm family, not just the bare string ([4d30ab5](https://github.com/axelhamil/clean-stack/commit/4d30ab58f9348572d7ed681dfa13e74e6fe8e76c))
* **sso:** resolve the org's provider deterministically and stop offering a second one ([3df7c56](https://github.com/axelhamil/clean-stack/commit/3df7c569a97287bf18b12adb5d5b5517e161d150))
* **sso:** stop a 404-ing scim delete from forging the actor on unrelated kicks ([4ad2970](https://github.com/axelhamil/clean-stack/commit/4ad2970fb4223bcc3ae0573e0f5e7c122bf91001))
* **test:** restore stub payload parse to success:true in outbox mock ([a9160bb](https://github.com/axelhamil/clean-stack/commit/a9160bb9162c701e4945fb06f666ea3d4ecd0fcc))
* **toolchain:** align dockerfiles and docs with node 24.20.0/bun 1.4.0/pnpm 11.24.0 ([40fb4db](https://github.com/axelhamil/clean-stack/commit/40fb4dbfdf09be5cc13e59049e083460afadb578))
* **ui:** bound modal height at the primitive instead of per dialog ([50830a2](https://github.com/axelhamil/clean-stack/commit/50830a2f6e94022e65dd86117bb15ec3df1b91d8))
* **uploads:** delete the replaced object when an avatar changes ([314dbef](https://github.com/axelhamil/clean-stack/commit/314dbef31e58a901a705ef9eb6ffea7f9ab1b5e2))

### Performance

* **email:** collapse marksent into a single statement ([03c8445](https://github.com/axelhamil/clean-stack/commit/03c8445b378ca1cc100791e2c4dae935fc739001))

### Refactor

* **api-token:** turn the public api into an injectable factory ([358b926](https://github.com/axelhamil/clean-stack/commit/358b926134477d953b938963b9d03f7fb33d1994))
* **api:** drop the unused session-based /me route ([7d97b4c](https://github.com/axelhamil/clean-stack/commit/7d97b4c6884f317b916c1687f3ec982d7bceceb6))
* **api:** enforce the required sweep lock at runtime, not just in types ([e569a7d](https://github.com/axelhamil/clean-stack/commit/e569a7d773e0e86d9ed054886d4ae3c0f2007609))
* **api:** extract and test the sweep cron's outcome classification ([14baf70](https://github.com/axelhamil/clean-stack/commit/14baf70156c0c621d8c1f0e35540f929b6dcfd13))
* **api:** give check-sweep-lock a fresh span facade per check ([da2e8b1](https://github.com/axelhamil/clean-stack/commit/da2e8b188400dad02083f212da50e1572543da7a))
* **api:** move the six sweep routes onto the shared instrumented purge ([bf5d257](https://github.com/axelhamil/clean-stack/commit/bf5d257365de4d65ebc2d544bade2503343f00fe))
* **api:** promote the batched sweep delete into one instrumented helper ([ce12453](https://github.com/axelhamil/clean-stack/commit/ce124539f6e31e80810826cd63ee3689f7c41c3d))
* **api:** promote the profile store port to the shared kernel ([44df0e5](https://github.com/axelhamil/clean-stack/commit/44df0e58f256a7843a5574b88dc494a665a17fc9))
* **api:** replace sweep as-sql casts with a named requirefilter guard ([4233736](https://github.com/axelhamil/clean-stack/commit/42337367a97f2d0fb7cbace6d4b14e8d4a976e8f))
* **api:** return an option for the queued email locale ([b9fe7c0](https://github.com/axelhamil/clean-stack/commit/b9fe7c07e1fb45723ab736b931b3ec01dae6bda0))
* **api:** scope the sweep lock's schema lookup to function bodies ([88e3e92](https://github.com/axelhamil/clean-stack/commit/88e3e92fecc0c31f7e3cd99278b67bfd6e2085ef))
* **api:** separate app construction from server boot ([07e850f](https://github.com/axelhamil/clean-stack/commit/07e850fbc984fe717f0d16e57b007749805dde1c))
* **api:** use the tolocale helper in the scanning route ([a66e184](https://github.com/axelhamil/clean-stack/commit/a66e184c3bc12bf8cb867febdb8a00196a2ad4df))
* **app:** bind the display locale inside the date formatters ([6db7cd0](https://github.com/axelhamil/clean-stack/commit/6db7cd0d07bab61b8689776ff23e8593d662d03c))
* **app:** let the router plugin own code-splitting ([76cc583](https://github.com/axelhamil/clean-stack/commit/76cc5833af5dfa78af6a13f86d0086e0f238c169))
* **app:** move the route tree to file-based routing ([9a9094a](https://github.com/axelhamil/clean-stack/commit/9a9094a4914e1f184c16f94ea9d23201a563986a))
* **app:** narrow zod issues on their discriminant instead of casting ([00fb798](https://github.com/axelhamil/clean-stack/commit/00fb798e4ce5d87f8129b08ce0354b1a37b99d16))
* **app:** point every policy title at the shared map ([ef4b2e3](https://github.com/axelhamil/clean-stack/commit/ef4b2e3c32420d830f17a62041240b7045f0bc44))
* **app:** promote broadcast channel into a generic primitive ([0c8bcc6](https://github.com/axelhamil/clean-stack/commit/0c8bcc6f322764e5d85b5e4628ba4b00aea93cd7))
* **app:** share one policy-title map and drop a guard nothing calls ([46c9644](https://github.com/axelhamil/clean-stack/commit/46c9644fe2150e39399911f4bc4bcccb6d225776))
* **emails:** derive template props from the template catalog ([8276340](https://github.com/axelhamil/clean-stack/commit/8276340f792af4a2e074efb61be7d46174684d43))
* **i18n:** move the sub-processor labels to the namespace that owns them ([5ae0ad6](https://github.com/axelhamil/clean-stack/commit/5ae0ad6ec03a3c37b11b58dc84a9e965a6c73295))
* **notifications:** move channel/frequency/scope constants to @packages/events ([853e9ea](https://github.com/axelhamil/clean-stack/commit/853e9ea8f084f29418086dc692f0daa8f85ddbe7))
* **sweep:** promote the retention runner to n passes ([e81864a](https://github.com/axelhamil/clean-stack/commit/e81864a04034cc870743cac81d192ad68f88f3f7))

### Build

* **db:** move postgres to 18-alpine ([c6b251f](https://github.com/axelhamil/clean-stack/commit/c6b251f922b0dce8a1f55dcdd609ed826e39054e))
* **ddd-kit:** emit declarations via tsc instead of tsup's bundled dts ([fbcbdb8](https://github.com/axelhamil/clean-stack/commit/fbcbdb895ae57634cf386aec94559c49d6a9846b)), closes [#4](https://github.com/axelhamil/clean-stack/issues/4)
* **deps:** move to typescript 7 and refresh the dependency floor ([9aa37ca](https://github.com/axelhamil/clean-stack/commit/9aa37cac9ec6f93646bbdd14915602efaa3b580a))
* **toolchain:** align pnpm and bump node, bun, pnpm to current ([2aeab0d](https://github.com/axelhamil/clean-stack/commit/2aeab0d5e964a1e6e7b1c5baceb5dddf5b535c14)), closes [package.json#packageManager](https://github.com/axelhamil/package.json/issues/packageManager)

### Documentation

* add d3 to the module inventory and the architectural log ([5e658ea](https://github.com/axelhamil/clean-stack/commit/5e658eaee5b9df106cd00ad176d1350819cd8d87))
* **api-token:** complete documentation pass for phase c.4 ([da664c6](https://github.com/axelhamil/clean-stack/commit/da664c644ac27963f21d46e24beaf31533caf0b1))
* **api-token:** record c.4 as-built and the public-surface rules ([a021340](https://github.com/axelhamil/clean-stack/commit/a0213404a99e169c27aa870ec5daafbf528b1741))
* **api:** move subsystem rules out of the always-loaded context ([7dba32b](https://github.com/axelhamil/clean-stack/commit/7dba32bbca649198251ba02aa80f5b97d4d035e7))
* **api:** reword the drizzle mock's overclaimed exhaustiveness note ([1bf2416](https://github.com/axelhamil/clean-stack/commit/1bf2416d731cd1203a1ed84a2523c4731ba41873))
* **api:** write the public api reference for token holders ([201ada1](https://github.com/axelhamil/clean-stack/commit/201ada1a7875e9b32a59cea1a0051c68f9233c0a))
* **app:** shrink the i18n carve-out to what still ships literals ([e658676](https://github.com/axelhamil/clean-stack/commit/e65867647981bd729cc144ef2e1accb0ec80881d))
* bring every document back to the as-built state ([2970f57](https://github.com/axelhamil/clean-stack/commit/2970f572bd317e2258bfe2abed2d33a6aee6119d))
* **claude:** correct the runtime floors to match engines ([e526eac](https://github.com/axelhamil/clean-stack/commit/e526eac1ad545aa2d9cee59a56e840a173e68b93))
* **claude:** state the real i18n boundary and the shared-front contracts ([5173928](https://github.com/axelhamil/clean-stack/commit/5173928a18117e88ab31d2838c3e9faecc4e44fe))
* correct event counts and fill two inventory gaps ([d78a9cf](https://github.com/axelhamil/clean-stack/commit/d78a9cffab64bef20db26586ac636df1e16ede73))
* correct the surface map counts to the as-built numbers ([0e0f9f1](https://github.com/axelhamil/clean-stack/commit/0e0f9f186e03ac7b8a980954368c1835b35265a7))
* correct two stale docblocks ([3fdfecb](https://github.com/axelhamil/clean-stack/commit/3fdfecb9e7607847707dc9b188240d017a50085f))
* **cron:** document the sweep lease and the three nested deadlines ([2b5cb38](https://github.com/axelhamil/clean-stack/commit/2b5cb3822cf047465ad23a9c1c17b3c253bac11a))
* **cron:** document the sweep rail's trace shape and span budget ([cab996c](https://github.com/axelhamil/clean-stack/commit/cab996cf4cface9ab6e992d033c78b63e9a910ae)), closes [#2](https://github.com/axelhamil/clean-stack/issues/2)
* **cron:** document the un-nested shutdown bound and the upgrade path ([54c2312](https://github.com/axelhamil/clean-stack/commit/54c2312009c6a8e925c1de45fcbbe02c349fa569))
* **cron:** record the lease/attribute fixes and the measured span truncation ([54c1aa7](https://github.com/axelhamil/clean-stack/commit/54c1aa73958dadae261428019e46b69ec5511e03))
* **db:** fix remaining postgres 17 prose and warn about the volume-mount move ([700cc30](https://github.com/axelhamil/clean-stack/commit/700cc30ed818de92256bb9505d08e035bd78a15a))
* declare the two retention knobs, and correct the audit-page counts ([d9760ed](https://github.com/axelhamil/clean-stack/commit/d9760ed64df8ce304b5b863577aced2293888d8b))
* **email:** describe both retention passes for email_message sweep ([745e86d](https://github.com/axelhamil/clean-stack/commit/745e86de091c0a45efcaf6cdbef4490bf74b6a1b))
* fix factual errors in the email queue debt closeout entry ([9289ca7](https://github.com/axelhamil/clean-stack/commit/9289ca7d6f7c409e8c40f1b7b3c8c782a2c9eb5a))
* fix stale claims left around the event rail ([265b52f](https://github.com/axelhamil/clean-stack/commit/265b52fcb2fc8045471ceab0e4b521ea0f1cfaf2))
* **i18n:** declare the locale cookie and record the e1a decisions ([3d9204a](https://github.com/axelhamil/clean-stack/commit/3d9204afd01f6b4f87ac70b2ee491e60e0905249))
* **i18n:** record the e1b extraction and retire the partial-translation carve-out ([0fbd89e](https://github.com/axelhamil/clean-stack/commit/0fbd89ed7698f7238c1c8486c9fd8f5cc01c038f))
* **modules:** promote 7 roadmap phases to shipped and recompute subtotals ([7947f54](https://github.com/axelhamil/clean-stack/commit/7947f54592eaf62fe420bc29d3831e44fe33a520))
* move e1b out of the backlog and use measured figures ([7112a68](https://github.com/axelhamil/clean-stack/commit/7112a68fe265c828f06cc3e80b566611523d396e))
* **notifications:** document the notification map projection ([8053e4a](https://github.com/axelhamil/clean-stack/commit/8053e4a8586a18b661dc5a1f3958a5bbc67d822b))
* point the inventory line at the public api reference ([afd1997](https://github.com/axelhamil/clean-stack/commit/afd19978aa46d25d3916b86cd0b7e74ab81ee70c))
* **readme:** mark c7 sso + scim as shipped ([5bb75c5](https://github.com/axelhamil/clean-stack/commit/5bb75c53f253330593194101775c0f99c395c8cc))
* record d3 notification center as shipped ([70a60e2](https://github.com/axelhamil/clean-stack/commit/70a60e2fb357873c869678fc9ddcb3020ffb7210))
* record the d5 email queue debt closeout ([1daca8d](https://github.com/axelhamil/clean-stack/commit/1daca8d3343cb54d0576697a38316db047b1114b))
* record the e1a i18n foundation across the doc set ([6f7af16](https://github.com/axelhamil/clean-stack/commit/6f7af16e68a985f41e401997d10e7bcedf6f130d))
* record the h1 surface parity audit and correct the e1b policy claim ([12d4d27](https://github.com/axelhamil/clean-stack/commit/12d4d278760551eae71ea6f640ad8a49fc914747))
* **roadmap:** add phase g.1 toolchain refresh ([afba410](https://github.com/axelhamil/clean-stack/commit/afba410edad78e572fb29612d9140d057efa17a4))
* **roadmap:** add the back/front parity audit and renumber the sweep backlog ([26eac5f](https://github.com/axelhamil/clean-stack/commit/26eac5fc20a50db4de6672d0fdb8d877c0dbbdb2))
* **roadmap:** correct c.4 spec and add public-surface curation to c.5 ([dec49aa](https://github.com/axelhamil/clean-stack/commit/dec49aa576684e85e9d135e6076cb49bab640f3c))
* **roadmap:** record g1 as shipped ([2081044](https://github.com/axelhamil/clean-stack/commit/2081044269230dc3ba7204ed9d22278a9e241c2c)), closes [#1](https://github.com/axelhamil/clean-stack/issues/1)
* **roadmap:** settle phase d.3 design and defer d.2 ([f6101be](https://github.com/axelhamil/clean-stack/commit/f6101be006760d8a72fca9d89eec4c997863f13c)), closes [#6](https://github.com/axelhamil/clean-stack/issues/6)
* **roadmap:** update event catalog count 65->67 ([fc69b7b](https://github.com/axelhamil/clean-stack/commit/fc69b7b296958e9051b33364ce76a15cadf77a41))
* **sso:** correct the superseded passkey enforcement claim in history ([0d28a74](https://github.com/axelhamil/clean-stack/commit/0d28a741c73bbaf991f166da9700f7a15b1af4e5))
* **sso:** record the final fix round and its accepted gaps ([30c5ba0](https://github.com/axelhamil/clean-stack/commit/30c5ba0d477991d47e5c68ab311fc7f4323686ca))
* **sso:** record the post-pr security review round ([f911663](https://github.com/axelhamil/clean-stack/commit/f911663549f1e967bb29248d521ae0e05263467f))

## [1.23.0](https://github.com/axelhamil/clean-stack/compare/v1.22.0...v1.23.0) (2026-08-05)

### Features

* **admin:** add audited ban, role, reset and session actions ([69cc344](https://github.com/axelhamil/clean-stack/commit/69cc3447bb24333f3ebc9ce7612e0edc08dce472))
* **admin:** add justified impersonation start and stop routes ([4cb2101](https://github.com/axelhamil/clean-stack/commit/4cb2101249df3a80f1ba0a8f268226d1e2a7b576))
* **admin:** add non-dismissable impersonation banner ([188b14e](https://github.com/axelhamil/clean-stack/commit/188b14e8a2d5d53fd9846acb4a905c69893629ec))
* **admin:** add platform user query service ([b76402f](https://github.com/axelhamil/clean-stack/commit/b76402f274b403d519f69daa21022d4511d51022))
* **admin:** add platform users list page ([96e1d67](https://github.com/axelhamil/clean-stack/commit/96e1d671ee96102dfe20c450e40cde29505b709d))
* **admin:** add read-only organization back-office pages ([345cb1c](https://github.com/axelhamil/clean-stack/commit/345cb1cf0f1b96397a8d55cb0b86f19925a50618))
* **admin:** add set-cookie relay primitive for impersonation ([e46688e](https://github.com/axelhamil/clean-stack/commit/e46688e5649475ad5075a700ee6bb831054e466b))
* **admin:** add user detail page with ban and impersonation flows ([469211c](https://github.com/axelhamil/clean-stack/commit/469211c946cd7c359b8aea9f92c6ff52f0d1e646))
* **admin:** block sensitive auth endpoints during impersonation ([5633702](https://github.com/axelhamil/clean-stack/commit/5633702017eca56dc3d2d806438ca65fe1eb811c))
* **admin:** deny sensitive business routes during impersonation ([f7bf43a](https://github.com/axelhamil/clean-stack/commit/f7bf43a5df03ecb76009bb3894db1c8ef011aad5))
* **admin:** expose impersonated-by on the session payload ([4d19ec2](https://github.com/axelhamil/clean-stack/commit/4d19ec28a27a5c640ed3a38982e3edf98d943c2f))
* **admin:** expose platform user list and detail routes ([367fdf7](https://github.com/axelhamil/clean-stack/commit/367fdf72c60a89994384cd6bc97440709cab458b))
* **admin:** expose read-only organization list and detail routes ([2b11433](https://github.com/axelhamil/clean-stack/commit/2b11433c38c9cedc216335f305aa9f90259a5bbd))
* **admin:** notify impersonated users by email ([d81af1c](https://github.com/axelhamil/clean-stack/commit/d81af1c54ff933513f367759805d9035ab4cf328))
* **api:** add email delivery worker with batch chunking ([d2ba5e8](https://github.com/axelhamil/clean-stack/commit/d2ba5e87c0ee128813f20344d0b8d62c3336f652))
* **api:** add email queue port and drizzle store ([f1e7963](https://github.com/axelhamil/clean-stack/commit/f1e79634b5e23b74997268b2cdef81c91cb79976))
* **api:** add email_message retention sweep ([2fa2b62](https://github.com/axelhamil/clean-stack/commit/2fa2b623e79a23bd089a2633fdeb162162f648ab))
* **api:** turn email service into a queue facade (sendraw, batch methods) ([92267ee](https://github.com/axelhamil/clean-stack/commit/92267ee7464c36cc83c1e461b4562d274cd17ce6))
* **api:** wire email queue and delivery worker into di and boot ([7cb1705](https://github.com/axelhamil/clean-stack/commit/7cb170540246b078add60d49fc7c1749f691301f))
* **drizzle:** add email_message queue table ([720308e](https://github.com/axelhamil/clean-stack/commit/720308ecacb47627c1c8e002870a6ceb508d7dca))
* **emails:** add in-repo react email templates package ([0257f2a](https://github.com/axelhamil/clean-stack/commit/0257f2ab969c7b21d42fee41ca9912ae1b902194))
* **events:** declare email.delivery.exhausted internal event ([494200d](https://github.com/axelhamil/clean-stack/commit/494200da328ad9158c5d033521bd2aac190a1b42))
* **events:** declare seven admin.* platform events ([20086d9](https://github.com/axelhamil/clean-stack/commit/20086d9ec0b1c001c7ede234ffdb7ba33470e42a))

### Bug Fixes

* **admin:** address task-13 round-1 review feedback ([5f9475e](https://github.com/axelhamil/clean-stack/commit/5f9475ed6236ef59aff155158cc1ae1f55eef026))
* **admin:** align iadminorgstore port to option<t> contract, remove nullable leak ([6dad9fa](https://github.com/axelhamil/clean-stack/commit/6dad9fa89bce14e46ad1382a39112fe3d1afdac7))
* **admin:** apply deny-impersonated per-mutation route, not globally ([af7a20b](https://github.com/axelhamil/clean-stack/commit/af7a20b86965a1497c792ee5d0d42310a87ac44a))
* **admin:** correct route names and session payload mechanism in docs ([9b5062f](https://github.com/axelhamil/clean-stack/commit/9b5062f0022e6ec7ec1a32bb7ed17a2c5322650a))
* **admin:** enforce option absence on the find-user port instead of nullable ([c8bd9da](https://github.com/axelhamil/clean-stack/commit/c8bd9da86f1d2eee216024e68d4a9c15fdcbae7f))
* **admin:** extend impersonation blocklist with social and session paths ([d63184e](https://github.com/axelhamil/clean-stack/commit/d63184ee7a10a991f1a5d3c67c031a89a91e6c02))
* **admin:** four qa defects on impersonation flow ([4ce660a](https://github.com/axelhamil/clean-stack/commit/4ce660a0a3378984e17090efb3e0ed6c18b8160f))
* **admin:** guard /stop against betterauth failure before emitting audit event ([5e59f75](https://github.com/axelhamil/clean-stack/commit/5e59f756e058543a0ac112ac66325a29b00f9743))
* **admin:** guard optional headers before loading session in the before-hook ([eb869ab](https://github.com/axelhamil/clean-stack/commit/eb869abfbcee63866c72a42649ef4e635d68e630))
* **admin:** live countdown and guard order in impersonation banner ([c020381](https://github.com/axelhamil/clean-stack/commit/c02038176d0ec7c2db6c557f2404ab2319bed941))
* **admin:** remove platform-admin mock leak in impersonation route test ([30b99a2](https://github.com/axelhamil/clean-stack/commit/30b99a2346335507e3d22184339eb1fee9b732a3))
* **admin:** resolve four pre-merge review items ([871381d](https://github.com/axelhamil/clean-stack/commit/871381dbb1d37ffacd0d4e383b4f7e86f374f91c))
* **admin:** strip out-of-scope actions from users list page ([2d53263](https://github.com/axelhamil/clean-stack/commit/2d5326358346f346ee9646b154386a95fac7fcc8))
* **admin:** surface email errors to telemetry and add support url ([87e9532](https://github.com/axelhamil/clean-stack/commit/87e953235e2a17b5c159293cb8fac235a5676f1b))
* **admin:** thread request headers to all auth.api calls in admin action service ([1980cb0](https://github.com/axelhamil/clean-stack/commit/1980cb0c194ecce0d8b16e15382e3ca27599bd42))
* **admin:** translate ui copy to english, fix nav routing and naming ([27ccbff](https://github.com/axelhamil/clean-stack/commit/27ccbff5044051d25f47ad02b662348087650d27))
* **admin:** translate validation messages and fix eager error display on form open ([bb179ab](https://github.com/axelhamil/clean-stack/commit/bb179ab8b73441dee742ad2c231b44b1467fd863))
* **admin:** unblock submit buttons and remove spurious wrappers ([99e4dd3](https://github.com/axelhamil/clean-stack/commit/99e4dd3c2d3b8fb22cd2a18c9545e66d5676d38c))
* **admin:** wire organization filter and add missing test coverage ([f52d873](https://github.com/axelhamil/clean-stack/commit/f52d87360e349f1a4b5953636032d8bc2d99693d))
* **api:** add outer spans to sendtemplate and sendraw in queued email service ([c4627d2](https://github.com/axelhamil/clean-stack/commit/c4627d210f0d77e3b4bf151d2c1e7f5f84ae0eaf))
* **email:** apply final pre-merge fixes for d5 email delivery ([41b59f8](https://github.com/axelhamil/clean-stack/commit/41b59f8c1ac0ae9b4893c1abdc2938f9fa9e81ef))
* **emails:** migrate from deprecated @react-email/components to react-email ([44e7c45](https://github.com/axelhamil/clean-stack/commit/44e7c456c9dc8414d2d9f138193f672940a3bb4e))

### Performance

* **rgpd:** batch deletion notifications in the wipe sweep ([9582f20](https://github.com/axelhamil/clean-stack/commit/9582f2073ccba516b08f443c5c7ae48ad613aec4))

### Refactor

* **ddd-kit:** close result.ok() type hole with overloads ([aa3d2c2](https://github.com/axelhamil/clean-stack/commit/aa3d2c2a45c94595b2d31011a076613028e97288))
* **email:** convert nullable queue port fields to option ([9e2a3e0](https://github.com/axelhamil/clean-stack/commit/9e2a3e07aaf9507b2a2113280420b7151cf588b9))
* **option:** apply option convention to consents, billing, rate-limiter (lot b) ([73e9808](https://github.com/axelhamil/clean-stack/commit/73e9808368b71307ce8921fcdc37437d0b9ddb24))
* **option:** apply option convention to outbox and audit ports (lot d) ([f8db14f](https://github.com/axelhamil/clean-stack/commit/f8db14f60d22275aefcca3bdf29d1835e0699b79))
* **webhooks:** convert nullable record fields to option ([452206c](https://github.com/axelhamil/clean-stack/commit/452206c6e32af512030be19a598cdf000bd00402))

### Build

* **api:** upgrade inwire to 3.1.3 ([7e518ed](https://github.com/axelhamil/clean-stack/commit/7e518ed1428214567854b02965a642652fdd8672))

### Documentation

* **admin:** record c.3 as-built and flip the roadmap ([e3fa516](https://github.com/axelhamil/clean-stack/commit/e3fa5166bf0c1d8683694621bcfe60eb2726c35a))
* **admin:** reflect qa-phase changes in c.3 documentation ([cb49c27](https://github.com/axelhamil/clean-stack/commit/cb49c27ffc4e98287f4bde85f66a83582d1cb5b7))
* as-built record for phase d.5 email delivery queue ([ca7e18f](https://github.com/axelhamil/clean-stack/commit/ca7e18f221b8ea3e235d22baa88591738adce120))
* compact roadmap, history, features and api rules ([68e1f26](https://github.com/axelhamil/clean-stack/commit/68e1f266941672f0f0f6d6556cb6c6f67506becc))
* **drizzle:** correct nested transaction error rationale ([b29dd36](https://github.com/axelhamil/clean-stack/commit/b29dd3690bfad3999f1e4d2a10a5d3fb79991efd))
* record privacy dashboard as-built + fix stale references ([6e8ab8e](https://github.com/axelhamil/clean-stack/commit/6e8ab8eb872ada1eefdd76fc2ecdec561fa92689))
* record the option/result convention back-fill ([b24d50d](https://github.com/axelhamil/clean-stack/commit/b24d50da4a3aaa256df6bf5f19d85323ea9cfbc9))
* **roadmap:** plan email batch sending + resend provider audit ([d31fa55](https://github.com/axelhamil/clean-stack/commit/d31fa550163e2c59a09331cae890aeec9a57f4f9))

## [1.22.0](https://github.com/axelhamil/clean-stack/compare/v1.21.0...v1.22.0) (2026-07-22)

### Features

* **admin:** add better-auth admin plugin columns (user role/ban, session impersonated-by) ([8486702](https://github.com/axelhamil/clean-stack/commit/8486702afe1ab684d5276438aa4dfaabc737054b))
* **admin:** add platform-admin allowlist env vars ([97c50bd](https://github.com/axelhamil/clean-stack/commit/97c50bd8492368dc917cb294c5ccde1ea0367196))
* **admin:** add requireplatformadmin middleware (allowlist + mfa gate) ([85c4826](https://github.com/axelhamil/clean-stack/commit/85c4826f0abf6bc6e3b5a3aba70d0b275fee8073))
* **admin:** audit-log operator page (filters, cursor pagination, metadata drawer, chain badge) ([c2da826](https://github.com/axelhamil/clean-stack/commit/c2da826efbdde3d826e470d119fef6d64896f5c2))
* **admin:** enable better-auth admin plugin + expose isplatformadmin on session ([421323a](https://github.com/axelhamil/clean-stack/commit/421323a88999f89c0684d81dcae395ca2151a1b0))
* **admin:** front /admin route zone + platform-admin gate ([c09cd03](https://github.com/axelhamil/clean-stack/commit/c09cd039f7d11c2fbe5396c8efc1bfd18b991557))
* **admin:** operator nav entries gated on platform admin ([426be73](https://github.com/axelhamil/clean-stack/commit/426be73231f6b74e0dcfbde6211d65b1d8961863))
* **api:** add assert public url ssrf guard (scheme + creds + dns resolution) ([84ba4dc](https://github.com/axelhamil/clean-stack/commit/84ba4dca272d2ae478ba47b3dbb3c3e1e9a114e5))
* **api:** add ssrf guard primitive for private/reserved ip detection ([4ce93c0](https://github.com/axelhamil/clean-stack/commit/4ce93c0c6829f2d87f6f86a4d7561c17b3e7eac3))
* **api:** add webhook secret-grace / auto-disable / response-capture env knobs ([22a8481](https://github.com/axelhamil/clean-stack/commit/22a8481f43815c3689ec0f1dcc899e5d9a0fd4f4))
* **app:** add privacy dashboard + contextual danger zones ([23e5284](https://github.com/axelhamil/clean-stack/commit/23e5284211ef627fc3668d64075c2ac2fd85365f))
* **audit:** add canonical serialization + sha-256 hash helper ([01bad9e](https://github.com/axelhamil/clean-stack/commit/01bad9e0fb5b4b11d2068bcb66b6b18346392c89))
* **audit:** add chain-verify (port + repo recompute + service) ([58222f1](https://github.com/axelhamil/clean-stack/commit/58222f167e4c313edcbae97a832e2672388a1fc5))
* **audit:** add monotone sequence column for hash-chain ordering ([a3d8408](https://github.com/axelhamil/clean-stack/commit/a3d84088dc2ec8f14ef5f6a5097732d34763486b))
* **audit:** compute tamper-evident hash chain on write (advisory-locked, env-gated) ([d58f300](https://github.com/axelhamil/clean-stack/commit/d58f300320096e97b8fb33504fa091db6b5c3690))
* **audit:** operator cross-org read + platform-admin gate + meta-audit + verify route ([766fe18](https://github.com/axelhamil/clean-stack/commit/766fe1860e8295b35fa1ed6e92751b256ea84a35))
* **auth:** emit backup-code events + rate-limit generate-backup-codes ([1069426](https://github.com/axelhamil/clean-stack/commit/1069426c77e477cfb7517a47bd53fac3897c4bb1))
* **auth:** recovery code fallback on two-factor challenge ([18b3226](https://github.com/axelhamil/clean-stack/commit/18b322626d02f99a02fd02cad3a34a8e281e9331))
* **billing:** add assertquota and requirequota gate primitives ([9e2c75b](https://github.com/axelhamil/clean-stack/commit/9e2c75b6c80e3a8bf23282d7893fa97e0a2e8f20))
* **billing:** add in-transaction reserve-quota with advisory lock ([4097834](https://github.com/axelhamil/clean-stack/commit/409783460278630035ae00b7d78cff6bd2f8db80))
* **billing:** add typed quota catalog and helpers ([9bbc84e](https://github.com/axelhamil/clean-stack/commit/9bbc84e5ab2600b038096d57f096ca9ac1b31025))
* **billing:** cached catalog service joining stripe prices to entitlements ([370aa33](https://github.com/axelhamil/clean-stack/commit/370aa332b7dcb4a31f6be425bb4a2a5b3e294b9f))
* **billing:** catalog source, module wiring and /billing routes ([e38ee86](https://github.com/axelhamil/clean-stack/commit/e38ee86cdf975331b9eaffd46b37556009333a69))
* **billing:** enforce per-plan seat limit via beforeaddmember hook ([ebe7bc0](https://github.com/axelhamil/clean-stack/commit/ebe7bc0e5379bfccf879eb9c245a2ec404427c42))
* **billing:** entitlements service resolves tier from state, grants from code ([1114522](https://github.com/axelhamil/clean-stack/commit/1114522d506c3cbc6acd646fd15fd98de7d18eae))
* **billing:** expose quotas front-side with usequota helper and quota-gate ([0990a89](https://github.com/axelhamil/clean-stack/commit/0990a899cd399f86ca15ccf346f565a24fd80847))
* **billing:** feature/plan/seat gates and 402 payment-required envelope ([4ac6f09](https://github.com/axelhamil/clean-stack/commit/4ac6f09cfe8571393b5bba47170cadd419014107))
* **billing:** front entitlements hook and featuregate/plangate primitives ([0779ff7](https://github.com/axelhamil/clean-stack/commit/0779ff714cf0c9213d901f7b0de0bb688a31e2b7))
* **billing:** front query/mutation primitives for plans, subscription, upgrade, portal ([e3386b1](https://github.com/axelhamil/clean-stack/commit/e3386b19f7383ea66f87e575cef5c729fd5fd0cb))
* **billing:** full stripe plugin config with lifecycle events and owner-scoped subscription auth ([f7483ed](https://github.com/axelhamil/clean-stack/commit/f7483ed34a01e3b6fe2ac72d8026192b3f2a3966))
* **billing:** public pricing page ([2971c6d](https://github.com/axelhamil/clean-stack/commit/2971c6d312200ee1485883afab664d2ae41e1ec5))
* **billing:** register stripe subscription client plugin ([7aaa990](https://github.com/axelhamil/clean-stack/commit/7aaa9908642708d43317aa6c051de1ce0b333222))
* **billing:** scaffold stripe plugin, subscription schema and env ([566f1f2](https://github.com/axelhamil/clean-stack/commit/566f1f210b8afcc9d060999eda812834b8538856))
* **billing:** settings billing page with plan status, portal and upgrade ([a8e6cd3](https://github.com/axelhamil/clean-stack/commit/a8e6cd380e177eebc2d32db796a514efbe6d6233))
* **billing:** shared pricing table with login-intent and upgrade ctas ([e493354](https://github.com/axelhamil/clean-stack/commit/e493354d2aed1e2d671519327d8dfb6b863fab0e))
* **billing:** subscription read port and instrumented store ([6168de7](https://github.com/axelhamil/clean-stack/commit/6168de7e0cec397caddd04403d90da3c8360364c))
* **billing:** typed entitlements config and gate predicates ([11ee023](https://github.com/axelhamil/clean-stack/commit/11ee0238f38da3f79acfeb81b6f6daad02e64ab8))
* **consent:** cookie consent management (rgpd/eprivacy) ([e796ee0](https://github.com/axelhamil/clean-stack/commit/e796ee0ee82d8e85a673923368dcea9f02373532))
* **ddd-kit:** add _quota_exceeded → 429 error suffix ([c53d9fc](https://github.com/axelhamil/clean-stack/commit/c53d9fc52f681dedc019ad4e53d22b0ce0bcd0e2))
* **developers:** public event catalog at /developers/events ([81e46b8](https://github.com/axelhamil/clean-stack/commit/81e46b8616cb1ce9daec65e7d0921505a90d727d))
* **drizzle:** add quota_usage table for high-volume quota counters ([2f3b23c](https://github.com/axelhamil/clean-stack/commit/2f3b23cd6c2c4fa7593c0110ae318869699058f4))
* **drizzle:** webhook endpoint rotation/auto-disable columns + webhook_delivery_attempt table ([74f527f](https://github.com/axelhamil/clean-stack/commit/74f527f51702f604094d8a4f3c4a35fe395dc912))
* **events:** add 4 webhook sota events (test, secret_rotated, disabled, exhausted) — 48→52 ([b04dfe4](https://github.com/axelhamil/clean-stack/commit/b04dfe414c093321522da3faa7a4ce530d3d942c))
* **events:** add internal/subscribable partition + wildcard subscription matcher ([c0b56c7](https://github.com/axelhamil/clean-stack/commit/c0b56c7ac8715e3f403974993fec64feaebab8a3))
* **events:** add security.operator.audit_accessed (compliance) — catalog 47 to 48 ([49cc7fc](https://github.com/axelhamil/clean-stack/commit/49cc7fc305bae79c154c507d38af3ffdf74b5eea))
* **events:** declare billing.quota.exceeded (operational) ([657236e](https://github.com/axelhamil/clean-stack/commit/657236e1834148f36226cbb3a8ac4da1e3aa6ff9))
* **events:** declare billing.subscription.* and billing.payment.failed ([325e24b](https://github.com/axelhamil/clean-stack/commit/325e24b0f08054fc6ee76fc9bc77778314b8e205))
* **events:** event descriptions + json-schema helper for public catalog ([2092f01](https://github.com/axelhamil/clean-stack/commit/2092f01bc06e4c6597d2d3ca6cfa08a544b2c937))
* **events:** user.mfa.backup_codes_regenerated + backup_code_used ([80add0d](https://github.com/axelhamil/clean-stack/commit/80add0d26d7ae89a7ff9734fcc6bde12aa74ecd7))
* **legal:** compliance docs bundle (a.3) ([e3e415d](https://github.com/axelhamil/clean-stack/commit/e3e415d51a7a32861013606fecf075873aaead6b))
* **notifications:** email on backup code use via onevent rail ([339c170](https://github.com/axelhamil/clean-stack/commit/339c1706adb5e4401e633355851a8c1ba203444d))
* **quotas:** add quota_usage store, period helper and di module ([c2b86da](https://github.com/axelhamil/clean-stack/commit/c2b86dad231fbe11b2e07168ddb037fa039f0df2))
* **security:** abuse-prevention quick wins (c.1 s5a) ([1730ca3](https://github.com/axelhamil/clean-stack/commit/1730ca35e1cbc0056d1bad11194a4e8b625aa1c7))
* **security:** recovery codes card with password-gated regeneration ([288fa26](https://github.com/axelhamil/clean-stack/commit/288fa26bedc30bbbe99591627dec4f5688392fb4))
* **security:** shared backup codes panel with copy + txt download ([29bae5a](https://github.com/axelhamil/clean-stack/commit/29bae5aae17d3163854c98af28d14b67215bbab5))
* **webhooks:** delivery attempts persistence + targeted enqueue repo methods ([9e8b5d5](https://github.com/axelhamil/clean-stack/commit/9e8b5d5664cd23def563af4e9a5a3a2272495639))
* **webhooks:** delivery-detail route + create/update ssrf guard + wildcard subscription dto ([2114ec8](https://github.com/axelhamil/clean-stack/commit/2114ec874b4b8139e77186085a49eea4e1ad56c1))
* **webhooks:** endpoint auto-disable + delivery-exhausted event ([6afca77](https://github.com/axelhamil/clean-stack/commit/6afca770e6a3e489461de5afc482463ca9f4ae36))
* **webhooks:** endpoint record + repo rotation/failure/disable methods ([86f653b](https://github.com/axelhamil/clean-stack/commit/86f653b0b0da5cc9737341f8bc28061d6793e818))
* **webhooks:** endpoint row, secret dialog, delivery timeline, verify snippet ([f4b869c](https://github.com/axelhamil/clean-stack/commit/f4b869c15a79d4ae293df736a0ee1f8c0e26dbf0))
* **webhooks:** form schema + grouped event-type picker + shared form ([0874c14](https://github.com/axelhamil/clean-stack/commit/0874c14f940ac98774e4b17c7fe32d7d30b93484))
* **webhooks:** front data layer — queries, mutations, delivery filters ([9d61763](https://github.com/axelhamil/clean-stack/commit/9d617632bc986aec615b73c30b4eefc14045af4b))
* **webhooks:** multi-secret hmac signer for zero-downtime rotation ([fbed2ec](https://github.com/axelhamil/clean-stack/commit/fbed2eca8e9762302eb0a786a89a3fa3affb5a50))
* **webhooks:** persist per-attempt request/response timeline ([9fb65ed](https://github.com/axelhamil/clean-stack/commit/9fb65ed6f00c2ac42368cb6d9501f8b3bb86fcec))
* **webhooks:** rotate-secret service + route (grace window) + secret_rotated event ([5d073a4](https://github.com/axelhamil/clean-stack/commit/5d073a41e43d6db17f3c5ac64e895c5c8ca0cb73))
* **webhooks:** settings page, route, tab + command-palette wiring ([ffbb262](https://github.com/axelhamil/clean-stack/commit/ffbb26257a0efabc3f9d942c44d57eedc89fb87d))
* **webhooks:** targeted test-send service + route + auto test on endpoint creation ([782cd12](https://github.com/axelhamil/clean-stack/commit/782cd12edac8a2ba02cd9fa42f7dc5c5eef8b065))
* **webhooks:** wildcard subscription matching + internal-event fanout skip ([7da5607](https://github.com/axelhamil/clean-stack/commit/7da56071ad574641836a42697d1bf4ffde4c544d))
* **webhooks:** worker dual-secret signing + delivery-time ssrf guard ([90e63b8](https://github.com/axelhamil/clean-stack/commit/90e63b8967170c1605a4fbfe6b372993a20ae002))

### Bug Fixes

* **api:** block hex-form ipv4-mapped ipv6 in ssrf guard ([6a32d75](https://github.com/axelhamil/clean-stack/commit/6a32d758eb00bef74fb818d1d99e344b134adc65))
* **app:** add explicit type annotation on api client to avoid ts2883 ([cc3643c](https://github.com/axelhamil/clean-stack/commit/cc3643c8e9428019b509a8192eea248230377303))
* **app:** boot with an empty sentry dsn env var ([0a78dc6](https://github.com/axelhamil/clean-stack/commit/0a78dc6f28cd4be373385b12bf2d3ef84f48a701))
* **auth:** keep native dash in backup code normalization ([663acc6](https://github.com/axelhamil/clean-stack/commit/663acc659b4f92ad4dce8909517742549a86b630))
* **billing:** capture stripe errors at source and degrade catalog to free-only ([6d4c3b4](https://github.com/axelhamil/clean-stack/commit/6d4c3b4220d549cb6d94c23c5e7a770ab4f98dfa))
* **billing:** gate seat cap on invitation acceptance path (§6) ([2af97c9](https://github.com/axelhamil/clean-stack/commit/2af97c9a35a8e01e384e2fed3d3a94c0140c5258))
* **billing:** harden quota gate emit, free data drift, and test coverage ([8651e20](https://github.com/axelhamil/clean-stack/commit/8651e2066644f1ebcd1bdae52b68aafa6f8cea57))
* **billing:** instrument catalog getcatalog with rule 8 span ([b81ab1c](https://github.com/axelhamil/clean-stack/commit/b81ab1c7aa385d51520a259ffa5f8b423260da9a))
* **billing:** portal authz, dedup cancelled event, drift-proof istier, front type cleanup, spans ([095ca1a](https://github.com/axelhamil/clean-stack/commit/095ca1a7d70948203cd82808c1c6cf5df943678c)), closes [8/#9](https://github.com/8/clean-stack/issues/9)
* **billing:** represent unlimited seats as null (json-safe) instead of infinity ([f8bae2b](https://github.com/axelhamil/clean-stack/commit/f8bae2b80ba280f5a600744134582447af283736))
* **billing:** restore feature-gate/plan-gate primitives and whitelist in knip ([c960d30](https://github.com/axelhamil/clean-stack/commit/c960d30ccf61291a93a891d73374871daddd903f))
* **ddd-kit:** resolve http status by most-specific error suffix (402 shadowed by 401) ([88ccadc](https://github.com/axelhamil/clean-stack/commit/88ccadc502810623a81956a3a47a1adf9195ccbc))
* **drizzle:** track quota_usage migration meta (journal + snapshot) ([eebdc89](https://github.com/axelhamil/clean-stack/commit/eebdc897e3d74ba1300a338cdb5fe2604cbb6f85))
* **events:** move billing.payment.failed to compliance retention (align billing family) ([acffc17](https://github.com/axelhamil/clean-stack/commit/acffc17c24fd50eec8665f8bd4f3b8411cb64428))
* **quotas:** correct increment fallback and cover the atomic upsert ([36fbc93](https://github.com/axelhamil/clean-stack/commit/36fbc931a3f89d91eebb6964e4fec9a2de010b8c))
* **test:** guard captured[0] access in audit-subscriber test (ts strict) ([bd6f76e](https://github.com/axelhamil/clean-stack/commit/bd6f76ed5c30c2c054ac201fdc062f11d2db4099))
* **test:** superset env mock in platform-admin + audit-subscriber tests (process-wide leak) ([7e69510](https://github.com/axelhamil/clean-stack/commit/7e6951012797387641346149882ffddcf224d30f))
* **webhooks:** cancel capped response stream to bound memory + transport-error attempt test ([9fad0f5](https://github.com/axelhamil/clean-stack/commit/9fad0f5b3c287ed3a09366643efc443323f82455))
* **webhooks:** derive delivery-status type + expose webhook-endpoint-with-secret alias ([3579837](https://github.com/axelhamil/clean-stack/commit/3579837e2f2161df0a42b0a045911373213d734c))
* **webhooks:** endpoint-scope delivery detail + re-enable reset passthrough test ([c288305](https://github.com/axelhamil/clean-stack/commit/c288305e1af6011468e964ca178ec021c1566cc8))
* **webhooks:** endpoint-scope replay + org-scope endpoint mutations + capture auto-test errors ([1897bad](https://github.com/axelhamil/clean-stack/commit/1897bad5691a19a953968372ef6218479246e3a0))
* **webhooks:** gate endpoint row write actions on write permission ([9d215bf](https://github.com/axelhamil/clean-stack/commit/9d215bf0c514597ead78e086d317eb1b2b2b3d28))
* **webhooks:** inject fetch into delivery worker + hibp to stop test global pollution ([aacf9ed](https://github.com/axelhamil/clean-stack/commit/aacf9edfd6e90426856c57673c94a2da193e9004))

### Refactor

* **api:** promote private ip ranges to shared/private-ranges for reuse ([a971b35](https://github.com/axelhamil/clean-stack/commit/a971b353147d227dcb96cb5442a6d31191bec61c))
* **billing:** drop stripe server sdk from app workspace ([cd6a28a](https://github.com/axelhamil/clean-stack/commit/cd6a28adae769a8f4d6f2bfed9dd830f8e7c5e64))
* **consent:** drop useless fragments in consent-gate ([4ed4254](https://github.com/axelhamil/clean-stack/commit/4ed4254a66b10800c787c18ac923a10aca9a0ec1))
* **webhooks:** disambiguate delivery attempt list from counter ([342dacc](https://github.com/axelhamil/clean-stack/commit/342dacc557e6a1a6c21c44fecd613c785e9e7509))

### Documentation

* add marketing overview (guided tour) + cross-link doc set ([09a0046](https://github.com/axelhamil/clean-stack/commit/09a0046b90dbd82771302bf6e8f2b1d7795af51c))
* **admin:** record c.2 operator audit-log as-built ([036f76b](https://github.com/axelhamil/clean-stack/commit/036f76bb05402d9600d30c51721fbfe79764f23d))
* **billing:** document b.2 quota gating primitives across sub-claude.md and integration docs ([7df1ff1](https://github.com/axelhamil/clean-stack/commit/7df1ff17a4b803427b7c102cf61f11f97dc4c478))
* **billing:** document billing plugin, module and entitlement gate primitives in claude.md rules ([b5d5485](https://github.com/axelhamil/clean-stack/commit/b5d54857f47c56dbecb048d46139bdbc3c00aaa6))
* **billing:** document quota gating skeleton and mark b.2 as-built ([cd1a62b](https://github.com/axelhamil/clean-stack/commit/cd1a62b1d0a961ea6582dd9e39729bc75c4b1ea1))
* **billing:** fix quota event source, advisory lock name, and as-built accuracy ([b97d67a](https://github.com/axelhamil/clean-stack/commit/b97d67afc8dc922e206b0c63907115377bdf0064))
* **billing:** record b.1 as-built and update features/modules/overview/integrations ([ae8e641](https://github.com/axelhamil/clean-stack/commit/ae8e641da84250f45b13a9b32b8a1d18bcb4e3c1))
* **billing:** stripe setup, metadata contract and roadmap/events update ([4073d38](https://github.com/axelhamil/clean-stack/commit/4073d38d472e16773cb206c89ef3d6deb48b3422))
* **readme:** c.5 webhooks front ui + public event catalog shipped ([4f231b6](https://github.com/axelhamil/clean-stack/commit/4f231b6df353f25e806af434fca3e845eb0433e6))
* **roadmap:** add a.7 gpc (ccpa opt-out) to m1 ([8d737d5](https://github.com/axelhamil/clean-stack/commit/8d737d5ceabf564ad17b6904db3f70c0920c9026))
* **roadmap:** defer a.7 gpc (bypass, no tracking substrate) ([00466cb](https://github.com/axelhamil/clean-stack/commit/00466cbfb71dd5f9b0d8697fc23df9b9645ac726))
* **roadmap:** mark b.2 quota gating section as-built with shipped banner ([850fc42](https://github.com/axelhamil/clean-stack/commit/850fc428882a20cddd54d6ff38c3419f1177b3e7))
* **security:** correct backup code format wording ([df5448f](https://github.com/axelhamil/clean-stack/commit/df5448f89c9bc75e84814f061fe4a52d01744cab))
* **security:** correct notifier path in c.6 history entry ([4c02d6c](https://github.com/axelhamil/clean-stack/commit/4c02d6c453224a21630f00e22f73110c3dffd114))
* **security:** record c.6 recovery codes as-built + event count 52->54 ([51184c2](https://github.com/axelhamil/clean-stack/commit/51184c2948b65dc6cbf051a8fb56685b5592e018))
* sync event count 38→40 + abuse-prevention (s5a) ([d9bb92d](https://github.com/axelhamil/clean-stack/commit/d9bb92dfa3d2c967598cda53c27326788316550d))
* sync roadmap/history/events to c.1 s5a shipped ([02f57a7](https://github.com/axelhamil/clean-stack/commit/02f57a756511fb1e157eb05415f8ceed29278a9b))
* sync roadmap/history/features/overview to a.3 shipped ([917e846](https://github.com/axelhamil/clean-stack/commit/917e84626cab8b20630a5fb847311c9bc7eaebaa))

## [1.21.0](https://github.com/axelhamil/clean-stack/compare/v1.20.1...v1.21.0) (2026-07-03)

### Features

* **api:** add sliding-window rate limiting behind instrumented port ([109da34](https://github.com/axelhamil/clean-stack/commit/109da34812f675fc4daf6671bb66bd117ebe3cf2))
* **api:** durable postgres rate-limit store, security event, auth-burst hardening ([3e64b4d](https://github.com/axelhamil/clean-stack/commit/3e64b4d0b165dd55f09c65283e44ff154aa77330))
* **security:** stateless csrf via origin allowlist on non-betterauth routes ([31dc28b](https://github.com/axelhamil/clean-stack/commit/31dc28b84b4b8fa8a7365b079ada49163d625e29))
* **security:** strict csp with per-request nonce + public csp-report endpoint ([c203a8b](https://github.com/axelhamil/clean-stack/commit/c203a8b6591199a7ccbdecb722a6123eda3e4757))

### Bug Fixes

* **app:** capture mutation errors by default, allowlist flow-control ([95360a1](https://github.com/axelhamil/clean-stack/commit/95360a101e2adee1af66b7df43f04f2c0852b9f0))
* **app:** skip flow-control mutation errors, align front scrub with api ([5a7c804](https://github.com/axelhamil/clean-stack/commit/5a7c8049fae0a087119b7f1a55e349e6cc2a63dd))
* **app:** wire sentry capture into tanstack query + sync user identity ([f53bb2d](https://github.com/axelhamil/clean-stack/commit/f53bb2d7e08e8c1e7d917409b708a40d6cdcdc4a))
* **security:** fail-closed auth rate-limit + prod cors_origin guard + trusted-proxy cidr/private ([0e46f58](https://github.com/axelhamil/clean-stack/commit/0e46f5881c6c6bb5b3fc01201e34dbcd9dc00942))
* **security:** isolate rate-limiter in a dedicated pg pool (c.1 s4.1) ([fed77d3](https://github.com/axelhamil/clean-stack/commit/fed77d3c7a062450bf7a1ce8a858da60bab7b301))

### Build

* **deps:** bump all deps to sota 2026 + migrate pnpm/biome/knip config ([5141fe8](https://github.com/axelhamil/clean-stack/commit/5141fe8c44a29d1b6e54eae9558aa63460e3c894))

### Documentation

* document c.1 security perimeter + railway trusted_proxies/cors guidance ([08aa290](https://github.com/axelhamil/clean-stack/commit/08aa29091a30a6aea18f430fe4aaff248d384a98))
* **readme:** add a full features section listing shipped + roadmap items ([04d5cbe](https://github.com/axelhamil/clean-stack/commit/04d5cbec91005aa86383f43fe97e5b2512201f23))
* **roadmap:** queue s4.1 rate-limiter store resilience as next c.1 priority ([e3b468c](https://github.com/axelhamil/clean-stack/commit/e3b468c75dd63f0f9c3a43c5c7a5bf03300d3f33))
* surface shipped legal coverage, cite betterauth oss plugins in roadmap ([6fa7915](https://github.com/axelhamil/clean-stack/commit/6fa7915f8adaec7d8cc15308c819b72f010a68ff))
* sync all docs to c.1 shipped (event count 35→38, security perimeter, claude.md) ([08eb0ca](https://github.com/axelhamil/clean-stack/commit/08eb0cae32319d8c14874d876b384576c2a5ba57))

## [1.20.1](https://github.com/axelhamil/clean-stack/compare/v1.20.0...v1.20.1) (2026-06-08)

### Bug Fixes

* **auth:** silence cancelled passkey conditional-ui toast on sign-in ([5a5e614](https://github.com/axelhamil/clean-stack/commit/5a5e6141a9fa09a5368482284f43ef272914cd82))

## [1.20.0](https://github.com/axelhamil/clean-stack/compare/v1.19.2...v1.20.0) (2026-06-08)

### Features

* **account:** profile rectification (rgpd art.16) + nist 800-63b-4 password baseline ([fa38d6c](https://github.com/axelhamil/clean-stack/commit/fa38d6c3feadc07ad87aab54bb525b947db6b1e1))
* **app:** enrich command palette nav + actions ([fa2978e](https://github.com/axelhamil/clean-stack/commit/fa2978e29022205141718081de28b390e2864cfa))
* **legal:** policy acceptance ui — sign-up checkbox + re-acceptance gate ([92d18c3](https://github.com/axelhamil/clean-stack/commit/92d18c351064336093b2910247c2bff5706ac7cc))
* **observability:** correlate audit_log rows to their originating request ([738bda7](https://github.com/axelhamil/clean-stack/commit/738bda7ea7b4bbda99749fa58c5283af7875450a))
* **policies:** privacy/terms versioning + acceptance recording (rgpd art.7) ([a44335e](https://github.com/axelhamil/clean-stack/commit/a44335ebc24cff48a13e5d5ffa7c642ff2b73282))

### Bug Fixes

* **audit:** attribute the admin actor on org.member.joined direct-add ([403283f](https://github.com/axelhamil/clean-stack/commit/403283f8f6470828b0a872a4808685402cb419b2))
* **policies:** record acceptance ip from the freshly-created session ([e1f4842](https://github.com/axelhamil/clean-stack/commit/e1f4842e1ba8ccb067eda8fd32039be72e4614dc))
* **storage:** s3-compatible put + seaweedfs ipv6 healthcheck ([09e3722](https://github.com/axelhamil/clean-stack/commit/09e3722929e43d41c6502b33e02cffcd9e05d40d))

### Performance

* **drizzle:** index webhook_delivery sweep + typed .desc() on time indexes ([4209edd](https://github.com/axelhamil/clean-stack/commit/4209edde155017dd40f9661cfcf16eaf09b3a091))

### Documentation

* close phase 0, trim roadmap, record railway prod closeout ([8f1fb4f](https://github.com/axelhamil/clean-stack/commit/8f1fb4f4261724dca05027b92d5a756aab44c404))
* document request-id correlation + add event-driven row to readme ([72fa3d9](https://github.com/axelhamil/clean-stack/commit/72fa3d99197c7a90ce08238f02132470b2650d3a))
* fix accuracy drifts surfaced by the full-repo review ([6771647](https://github.com/axelhamil/clean-stack/commit/67716474f0bbaf04c571c1ba0b0a251081bc2232))
* jsdoc obscure shared helpers + close a.1 in roadmap/history ([6121242](https://github.com/axelhamil/clean-stack/commit/612124200b8103591d6523c789f5ae9f38074bcf))
* record a.2 policy versioning + close it in the roadmap ([c625d54](https://github.com/axelhamil/clean-stack/commit/c625d54a2efe4d4f77bc302a74318db8c58323d8))
* **roadmap:** close phase 0 — railway deploy live on main (1.19.2) ([a78841b](https://github.com/axelhamil/clean-stack/commit/a78841b7a4ec61e633b1a425c9a67d59977edaa3))
* slim roadmap to build-order milestones, reclassify consent as infra ([9afa0b9](https://github.com/axelhamil/clean-stack/commit/9afa0b98fb00bb138b90bc3f1385bc7f369e40c8))

## [1.19.2](https://github.com/axelhamil/clean-stack/compare/v1.19.1...v1.19.2) (2026-06-02)

### Bug Fixes

* close audit findings across rgpd, auth races, webhook telemetry ([c22bf07](https://github.com/axelhamil/clean-stack/commit/c22bf0745c9405b2171ed71e39f8a262fb0a3aec))
* **deploy:** resilient prod boot, cross-site cookies, gated build-info ([88f5ba0](https://github.com/axelhamil/clean-stack/commit/88f5ba0f4a98746ea53530775f5915f9b556a4ef))

### Documentation

* **deploy:** document railway boot traps, degradation and cookie topology ([bc86e74](https://github.com/axelhamil/clean-stack/commit/bc86e74522accb4dd321458f7b893281327b0742))
* **roadmap:** flag phase 0.7 prod validation in-progress (healthcheck fail) ([8851f11](https://github.com/axelhamil/clean-stack/commit/8851f1198cc6ed2b75478d3c5a010d4786712d99))

## [1.19.1](https://github.com/axelhamil/clean-stack/compare/v1.19.0...v1.19.1) (2026-05-27)

### Bug Fixes

* **deploy:** run api from ts source instead of bundling ([31a7c3b](https://github.com/axelhamil/clean-stack/commit/31a7c3beeac7244dc60c515e1da5adcfc1eb87d9))

## [1.19.0](https://github.com/axelhamil/clean-stack/compare/v1.18.0...v1.19.0) (2026-05-27)

### Features

* **deploy:** ship phase 0.7 railway reference deploy ([272da6b](https://github.com/axelhamil/clean-stack/commit/272da6b997c58fc7fd942263f7924a5b90c61d7c))

### Documentation

* log phase 0.4 in history and reclassify tele subscribers todo ([dac078b](https://github.com/axelhamil/clean-stack/commit/dac078b62e49f1a0e75bb13f9220222d98ee7c11))
* **roadmap:** add phase 0.7 railway reference deploy ([54ab561](https://github.com/axelhamil/clean-stack/commit/54ab561c73a41c775f013871fec5745ea35afeae))
* **roadmap:** close phase 0.5 with removability runbook from rgpd dry-run ([6934e0e](https://github.com/axelhamil/clean-stack/commit/6934e0e7bc0a7297e1a5a9893d8de09f74c852c9))

## [1.18.0](https://github.com/axelhamil/clean-stack/compare/v1.17.2...v1.18.0) (2026-05-27)

### Features

* **observability:** ship phase 0.4 sentry with iinstrumentation port ([3d4ed30](https://github.com/axelhamil/clean-stack/commit/3d4ed302b479e7d3caf1b301f528c705d491466a))

### Documentation

* ship phase 0.3 disaster recovery (doc-only, pitr-first) ([2ac7a85](https://github.com/axelhamil/clean-stack/commit/2ac7a856fd63ba8ec2a63e85c214015a95923488))

## [1.17.2](https://github.com/axelhamil/clean-stack/compare/v1.17.1...v1.17.2) (2026-05-26)

### Refactor

* enforce result/option contracts and promote shared helpers ([6faad36](https://github.com/axelhamil/clean-stack/commit/6faad3613fa594c28eae9fdf3df9488bc69d89a7))

### Documentation

* drop phase 0.0 and align with seaweedfs port pin ([e1cad25](https://github.com/axelhamil/clean-stack/commit/e1cad254ebe4605fcabd7eb845323b32bc79546b))

## [1.17.1](https://github.com/axelhamil/clean-stack/compare/v1.17.0...v1.17.1) (2026-05-25)

### Bug Fixes

* **db:** inline literals in webhook_delivery partial index predicate ([daf588b](https://github.com/axelhamil/clean-stack/commit/daf588b4df1903dab7c2a2258e37e35691a93d54))

## [1.17.0](https://github.com/axelhamil/clean-stack/compare/v1.16.0...v1.17.0) (2026-05-25)

### Features

* **health:** add /livez /readyz /startupz probes with graceful shutdown ([a749325](https://github.com/axelhamil/clean-stack/commit/a7493256219516457b53fa52f6b0e064cde38c0b))

### Refactor

* **db:** split drizzle schema into auth + multi-tenant contexts ([5526e70](https://github.com/axelhamil/clean-stack/commit/5526e706cf0aaa44047259396612e388b0787803))

## [1.16.0](https://github.com/axelhamil/clean-stack/compare/v1.15.0...v1.16.0) (2026-05-25)

### Features

* **retention:** add internal sweep routes for outbox, audit_log, webhook_delivery ([261d2fc](https://github.com/axelhamil/clean-stack/commit/261d2fcbd61cd2088eeb63ae6dc58ef22917c330)), closes [#6](https://github.com/axelhamil/clean-stack/issues/6)

## [1.15.0](https://github.com/axelhamil/clean-stack/compare/v1.14.5...v1.15.0) (2026-05-25)

### Features

* **audit:** enforce actor identification + runtime payload validation ([ccb3006](https://github.com/axelhamil/clean-stack/commit/ccb3006f4046f56ceb9140f0bb1c275f57fbb74b)), closes [#7](https://github.com/axelhamil/clean-stack/issues/7)

## [1.14.5](https://github.com/axelhamil/clean-stack/compare/v1.14.4...v1.14.5) (2026-05-20)

### Refactor

* **api:** regroup /internal/* concern under shared/internal-routes/ ([18073bc](https://github.com/axelhamil/clean-stack/commit/18073bc128f3464fd9d485303fc0e458698a18a2))

### Documentation

* **events:** add event pipeline visual walkthrough ([41b334c](https://github.com/axelhamil/clean-stack/commit/41b334c7614352bc4daeb6162982b183b7c44af4))
* log event pipeline doc + event emitter tx-aware hardening ([12fefd3](https://github.com/axelhamil/clean-stack/commit/12fefd3ce9a2372f8f776838fd23dbca794c0518))
* **roadmap:** add phase 0.6 retention sweeps for event-driven tables ([4012e95](https://github.com/axelhamil/clean-stack/commit/4012e9592291c90796622104e6b152fa9f194a80))

## [1.14.4](https://github.com/axelhamil/clean-stack/compare/v1.14.3...v1.14.4) (2026-05-19)

### Bug Fixes

* **events:** make event emitter tx-aware and atomic with rgpd writes ([12b8f74](https://github.com/axelhamil/clean-stack/commit/12b8f74ec0fa0eb3a60cc1c56e863a3dd47bbe66))

### Documentation

* **readme:** add WIP status notice + issue policy ([3058f4b](https://github.com/axelhamil/clean-stack/commit/3058f4bdf3fe5b55831d0c3b2240676f6cfdde4b))

## [1.14.3](https://github.com/axelhamil/clean-stack/compare/v1.14.2...v1.14.3) (2026-05-15)

### Bug Fixes

* **ddd-kit:** point package entry to src/ in monorepo, dist/ only at publish ([80cac58](https://github.com/axelhamil/clean-stack/commit/80cac586a8dc2e03afc3d1b5a258a8bcd872a1ca))

### Build

* **api:** drop redundant @packages/* prebuild from dev image ([2043b0d](https://github.com/axelhamil/clean-stack/commit/2043b0db7636775d2f5cfdda6f30ec5162d90d69))

## [1.14.2](https://github.com/axelhamil/clean-stack/compare/v1.14.1...v1.14.2) (2026-05-11)

### Build

* **deps:** bump pnpm 10.33.2 to 11.0.9 + approve esbuild ([6d1cf4c](https://github.com/axelhamil/clean-stack/commit/6d1cf4ce88460d7b1db9d4df5a691ff843acb0b0))

### Documentation

* pin `docker compose up postgres -d` for native dev ([34188a6](https://github.com/axelhamil/clean-stack/commit/34188a6bd52a2540a89f327e7c5da9cd21a5ad0a))

## [1.14.1](https://github.com/axelhamil/clean-stack/compare/v1.14.0...v1.14.1) (2026-05-11)

### Bug Fixes

* **api:** run migrations on boot before outbox dispatcher start ([07633c5](https://github.com/axelhamil/clean-stack/commit/07633c5779d31cc043e73825b1ff61123b3ee69d)), closes [#29](https://github.com/axelhamil/clean-stack/issues/29)
* **ui:** add missing tailwindcss dep to packages/ui ([1d56aba](https://github.com/axelhamil/clean-stack/commit/1d56abae6553e72102552d5fddbf316888c91a68))

### Documentation

* **events:** document deployment requirements + serverless compat ([0bed85a](https://github.com/axelhamil/clean-stack/commit/0bed85a06a2f41e72b639f2ad87b2cb8327e0d7c))

## [1.14.0](https://github.com/axelhamil/clean-stack/compare/v1.13.0...v1.14.0) (2026-05-07)

### Features

* **access-control:** add audit-log/webhooks resource permissions ([5b7cd22](https://github.com/axelhamil/clean-stack/commit/5b7cd228e59d242db3055cb1054e566f1700c103))
* **api:** add audit-log + webhooks modules (admin routes + crud + hmac delivery worker) ([809c770](https://github.com/axelhamil/clean-stack/commit/809c770e1d4e93f319302c863fd3aca31ade990a))
* **api:** add transactional outbox foundation (dispatcher + subscribers + aead + jitter) ([193013d](https://github.com/axelhamil/clean-stack/commit/193013d756ae2fcaf1853128dd8a052deb26d223))
* **auth:** bridge betterauth events to outbox via 4 lifecycles ([a54da1b](https://github.com/axelhamil/clean-stack/commit/a54da1b8b157e18555840a2f0af1fba8abb1d76f))
* **ddd-kit:** add event-collector als, on-event factory, uuid v7, iunit-of-work.run ([9f5c9e2](https://github.com/axelhamil/clean-stack/commit/9f5c9e28bb8ec3bc14f6803821b1dd06e179c19a))
* **drizzle:** add outbox/audit-log/webhooks schemas + uow.run flush handler ([77b4968](https://github.com/axelhamil/clean-stack/commit/77b4968494a788251c448430c5be28d4e00f96d1))
* **events:** add @packages/events shared catalog ([ead42a8](https://github.com/axelhamil/clean-stack/commit/ead42a820f13a2f835b0bf22b68d1441ce5856e9))
* **rgpd,uploads:** emit lifecycle events + delete /uploads route ([3f77d4a](https://github.com/axelhamil/clean-stack/commit/3f77d4aea88c9b08db3ffe1f684cfbcfdf581c56))

### Documentation

* roadmap + history + events guide + 2 cross-cutting rules (orm-first, every-state-change-emits) ([becc295](https://github.com/axelhamil/clean-stack/commit/becc295ebef9da77cbb2eb51572cbf44530ba7f9)), closes [#5](https://github.com/axelhamil/clean-stack/issues/5) [#6](https://github.com/axelhamil/clean-stack/issues/6) [#5](https://github.com/axelhamil/clean-stack/issues/5) [#6](https://github.com/axelhamil/clean-stack/issues/6)
* **roadmap:** mark internal-packages-no-build done + log teams rollback in shipped ([febabe7](https://github.com/axelhamil/clean-stack/commit/febabe79763fed581049a3c7f030090b8e4467f8))

## [1.13.0](https://github.com/axelhamil/clean-stack/compare/v1.12.0...v1.13.0) (2026-05-05)

### Features

* **app:** split danger zone into dedicated settings tab ([733983d](https://github.com/axelhamil/clean-stack/commit/733983dafe70b42a7303c36545b725294f041ff9))
* **auth:** log emails to stdout in dev + resend verify on signin ([81dc6f3](https://github.com/axelhamil/clean-stack/commit/81dc6f36e0aed4ce0b4f9a87d2ed7324094af72f))

### Refactor

* **org:** drop betterauth teams plugin and merge settings into one tab ([ec462bc](https://github.com/axelhamil/clean-stack/commit/ec462bc09bbc54f30e580e601cd10625f4a9b92d))

### Build

* **packages:** convert private workspace packages to source-only exports ([8c419cd](https://github.com/axelhamil/clean-stack/commit/8c419cdfc1c8c2b6d62f708cd211adf98bf18fab))

### Documentation

* **claude:** codify internal-packages-no-build as a cross-cutting rule ([30bc918](https://github.com/axelhamil/clean-stack/commit/30bc9189e4afd28cd7f7739b003af7c1ac49ab57))

## [1.12.0](https://github.com/axelhamil/clean-stack/compare/v1.11.2...v1.12.0) (2026-05-05)

### Features

* **env:** require only db url + auth keys at boot ([1a2f811](https://github.com/axelhamil/clean-stack/commit/1a2f811bf9a8dbd50545d9de956f77d8280d3897))
* **scripts:** add bootstrap script + rename docker:dev → dev:docker ([09225ff](https://github.com/axelhamil/clean-stack/commit/09225ff58efd1ba67933f9de1ba19e64d72586ed))

### Bug Fixes

* **db:** drizzle-kit push --force for non-tty safety under turbo ([5500316](https://github.com/axelhamil/clean-stack/commit/550031631f44e07256c20dee4c0462eb9fa9477a))
* **env:** treat empty string env vars as undefined ([d5a3098](https://github.com/axelhamil/clean-stack/commit/d5a30986b29a0acab385ceecefb0611b0202cca0))
* **turbo:** expand globalenv with wildcards for env passthrough ([5edceb4](https://github.com/axelhamil/clean-stack/commit/5edceb417a80981cf5dffc21d1773ba3c646734e))

### Documentation

* **readme:** merge docker + compose links in prerequisites ([d66af14](https://github.com/axelhamil/clean-stack/commit/d66af14790e4cb2249c5e17b8989dc28233421a4))
* **readme:** rewrite with two install paths + why-bother + infra ([42ba6a2](https://github.com/axelhamil/clean-stack/commit/42ba6a233b69db9a173860dd4eea8d963894e224)), closes [#21](https://github.com/axelhamil/clean-stack/issues/21)

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
