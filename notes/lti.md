# LTI 1.3 (design, 26 October 2026; not built)

Why: MusicFirst Classroom runs inside a district's LMS through LTI 1.3 and
plugs partner software in the same way; Canvas, Schoology, Moodle, D2L
Brightspace (Stride's LMS) and Blackboard all launch tools by it; and the
curriculum project (Obsidian, Business/Curriculum plan) is delivered by it.
One build serves all three. Google Classroom and ClassLink stay as they are.

What it gives a teacher: add abcSightReading to a course in their LMS once,
then add our assignments from the LMS's own "add activity" picker; students
open them from the LMS with no separate login; grades land in the LMS
gradebook.

## The three parts of LTI 1.3 we need

1. **Core launch** (OIDC third-party login, then a signed `id_token`).
2. **Deep Linking 2.0**: the teacher picks what to embed (a step, a UIL
   level, a saved preset, a piece's bars) in our picker, and we hand the LMS
   a resource link carrying it.
3. **Assignment and Grade Services (AGS)**: post each student's score to the
   line item for that link. **Names and Role Provisioning (NRPS)** later, for
   a class roster before anyone launches.

## Flow

```
LMS                         abcSightReading
 | -- POST /lti/login ------> |  (iss, login_hint, target_link_uri, lti_message_hint, client_id)
 |                            |  check iss+client_id is a registered platform; store state+nonce (cookie + DB, 10 min)
 | <-- 302 to platform auth --|  (response_type=id_token, scope=openid, prompt=none, response_mode=form_post)
 | -- POST /lti/launch -----> |  (id_token, state)
 |                            |  verify JWT against the platform's JWKS (jose createRemoteJWKSet), aud, nonce once, exp
 |                            |  message_type: LtiResourceLinkRequest -> open the assignment
 |                            |                LtiDeepLinkingRequest  -> our picker, then a signed reply JWT
```

`jose` 6 is already in node_modules (Better Auth's dependency); add it to
package.json directly before using it.

## Who the person is

The launch carries `iss` (the platform), `sub` (the user there), roles,
the context (course) and the resource link.

- Account link: a Better Auth `account` row, providerId `lti:<platform id>`,
  accountId `sub`, as Classroom's students are linked by Google's userId
  (`src/lib/server/classroom.ts`).
- **A learner** gets a student account with no email (`createStudentAccount`
  in `src/lib/server/students.ts` shape, but no credential account: they only
  ever arrive through the LMS), name from the claim if sent. Never keep the
  email claim (as `stripStudentTokens`): the student may be under 13.
- **An instructor** is matched to an existing account only if they have
  linked it themselves once (a "Connect your abcSightReading account" step
  on first launch, signed in as themselves); otherwise an educator account
  is made. Never matched by email alone (the ClassLink rule).
- A session is made after the launch (Better Auth internal adapter
  `createSession`) and the cookie set with `SameSite=None; Secure`, since the
  page is usually in an iframe. Safari blocks third-party cookies in
  iframes, so the launch page offers "Open in a new tab" (LTI's
  `launch_presentation.document_target` window), and that is the default
  for microphone pages: an iframe also needs `allow="microphone"`, which an
  LMS may not set.

## Classes

The LMS context (`context.id`) maps to a `Class` (`rosterSource`
`lti:<platform>:<context id>`), owned by the first instructor who launches
it; students launching into it are enrolled (`Enrollment`), and seats count
as for any class. Who pays: a launch into a class whose teacher has no
Educator plan still works for the teacher; students get Pro through the
teacher's plan as now.

## Assignments and grades

- Deep linking creates an `Assignment` (the existing model and
  AssignmentWizard's kinds) and returns an `ltiResourceLink` with
  `custom: { assignment: <id> }` and a `lineItem` (scoreMaximum 100), so
  the LMS makes the gradebook column.
- A launch of that link opens `?assignment=<id>` as now.
- Grade passback: when an attempt is graded (`PieceAttempt`, the gradebook's
  best attempt rule in `src/lib/gradebook.ts`), POST a score to the line
  item (`application/vnd.ims.lis.v1.score+json`, activityProgress
  Completed, gradingProgress FullyGraded), with a token from the platform's
  token endpoint (client credentials, a JWT signed with our private key).
  Practice minutes: scoreGiven the share done, gradingProgress Pending, as
  the gradebook shows minutes.
- Mirrors `src/lib/server/classroom-grades.ts`, which does the same for
  Google Classroom; share the "best attempt" logic.

## Keys and registration

- Our signing key pair: RS256, private key in an env var
  (`LTI_PRIVATE_KEY`, PEM), public JWKS at `/.well-known/jwks.json`, `kid`
  so it can rotate.
- Platforms: a table, entered from /admin at first (Dynamic Registration
  later, which Canvas and Moodle support).

```prisma
model LtiPlatform {
  id           String   @id @default(cuid())
  name         String              // "Katy ISD Canvas", "MusicFirst"
  issuer       String
  clientId     String
  deploymentIds String[]
  authUrl      String              // OIDC auth endpoint
  tokenUrl     String              // OAuth2 token endpoint (AGS)
  jwksUrl      String
  createdAt    DateTime @default(now())
  @@unique([issuer, clientId])
}

model LtiNonce {                    // state + nonce, one use, 10 minutes
  nonce     String   @id
  state     String
  platformId String
  expiresAt DateTime
}

model LtiLineItem {                 // where an assignment's grades go, per platform
  id           String @id @default(cuid())
  assignmentId String
  platformId   String
  lineItemUrl  String
  @@unique([assignmentId, platformId])
}
```

Applied the safe way (CLAUDE.md, Accounts): `prisma migrate diff` to SQL,
read it, `bun run db:deploy`.

## Routes

| Route | What |
|---|---|
| `GET/POST /lti/login` | OIDC initiation |
| `POST /lti/launch` | id_token in; resource link or deep link |
| `GET /lti/pick` | the deep linking picker (presets, steps, levels, pieces), then an auto-posting form back to the platform |
| `GET /.well-known/jwks.json` | our public keys |
| `GET /lti/config.json` | Canvas JSON config; `/lti/register` Dynamic Registration later |

Security: verify every claim (iss, aud includes our client id, azp, exp,
iat, nonce once, deployment id registered, `message_type`, LTI version
1.3.0); rate limit `/lti/*`; never trust `custom` without the signature;
CSRF is the state check.

## Testing

- Unit: claim validation, role mapping, deep link reply JWT
  (`tests/unit/lti.test.ts`), with a fake platform keypair.
- End to end on a local server: the 1EdTech reference platform or
  saltire.lti.app (a public LTI test platform), then a free Canvas
  instructor account and Moodle in Docker. A `scripts/check-lti.ts` that
  plays the platform (sign an id_token with a test key, POST the launch,
  check the session, the class and the grade POST to a stub line item).
- 1EdTech certification once it works (MusicFirst and districts ask for it).

## Order of work

1. Keys, JWKS, platform table, login + launch for a resource link, a learner
   and instructor session. Test against saltire.
2. Deep linking picker for presets and steps.
3. AGS grade passback from graded attempts.
4. Canvas config JSON, then Dynamic Registration.
5. NRPS roster, Common Cartridge export (curriculum).
