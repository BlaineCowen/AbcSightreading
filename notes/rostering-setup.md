# Rosters: Google Classroom and ClassLink

What the code does is in CLAUDE.md ("Rosters from Google Classroom and
ClassLink"). This is what has to be set up outside it, by Blaine.

## Google Classroom

The site's Google sign-in client (`GOOGLE_CLIENT_ID`) does the Classroom
import too. Nothing new goes in the environment.

1. **Google Cloud console**, the project that holds that client:
   APIs & Services > Library > **Google Classroom API** > Enable.
2. **Google Auth Platform > Data access > Add or remove scopes**, and add both:
   - `https://www.googleapis.com/auth/classroom.courses.readonly`
   - `https://www.googleapis.com/auth/classroom.rosters.readonly`

   Both are "sensitive", not "restricted", so there is no security audit.
3. **Branding:**
   - App name: abcSightReading
   - Logo: `public/og.png`, cropped square, or the favicon
   - Home page: https://www.abc-sightreading.com
   - Privacy policy: https://www.abc-sightreading.com/privacy
   - Authorised domain: abc-sightreading.com. It must be verified in Search Console under the same Google account.
4. **Redirect URIs.** Nothing new: connecting Classroom uses the same
   `/api/auth/callback/google` as sign-in, on each domain already listed.
5. **Try it before verification.** Unverified, the app works for up to 100
   people after a "Google hasn't verified this app" screen (Advanced > Go to
   abcSightReading):
   - In Google Classroom, with your own Google account, make a class.
   - Join it as a student from a second Google account.
   - On /account, use Import from Google Classroom on a class.
   - Sign in as that student on the Student tab with Sign in with Google.
6. **Submit for verification** (Google Auth Platform > Verification centre).
   They want:
   - An unlisted YouTube video. Record each step:
     1. Sign in as a teacher.
     2. Choose Import from Google Classroom.
     3. The consent screen, with the URL bar showing the client ID.
     4. Picking a class.
     5. The students appearing.
     6. A student signing in with Google and seeing an assignment.
   - A justification for each scope. Suggested wording:
     - **courses.readonly:** "A music teacher picks which of their Google Classroom classes to bring into abcSightReading. We list their active classes by name and section so they can choose."
     - **rosters.readonly:** "We read the chosen class's student list (names and Google user IDs) to create each student's practice account. Students then sign in with Google, so the teacher never types a roster or hands out passwords. We do not read emails, coursework or grades."

   Reports put it at a few days to a few weeks.

### What a school's Google admin has to do (students under 18)

Since October 2023, students marked under 18 in Google Workspace for
Education cannot sign in to an app their admin has not allowed. Teachers
are not affected. Send this to a teacher's IT department:

> Admin console > Security > Access and data control > API controls > App
> access control > Manage third-party app access > Configure new app >
> search by OAuth client ID **`<GOOGLE_CLIENT_ID>`** > abcSightReading >
> choose the student organisational unit > **Trusted** (or Limited).
> Students only sign in with their basic profile (name and ID); the app
> never asks students for Classroom or Drive access.

Some districts already allow any app that only asks for basic sign-in.
There, students can sign in with nothing set up.

## ClassLink

1. **Partner Portal.** Start at https://www.classlink.com/partners. It is
   free. The person signing up needs an email **at abc-sightreading.com**,
   since ClassLink matches it to the website. Porkbun forwarding only
   receives mail, so first set up a real mailbox there, either Porkbun email
   or Google Workspace. The onboarding contact is partners@classlink.com.
2. **Create the OAuth2 app** in the portal:
   - **Redirect URIs:**
     - https://www.abc-sightreading.com/api/auth/callback/classlink
     - https://dev.abc-sightreading.com/api/auth/callback/classlink
     - http://localhost:4321/api/auth/callback/classlink
   - **Launch URL** for the LaunchPad tile: https://www.abc-sightreading.com/classlink
   - **Scope:** profile
3. **Keys.** Put `CLASSLINK_CLIENT_ID` and `CLASSLINK_CLIENT_SECRET` in
   Vercel (Production and Preview) and in `.env.local`. "Sign in with
   ClassLink" then appears on /login, and /classlink works.
4. **Test** in ClassLink's test tenant from the portal.
5. **Request certification**, which lists the app in ClassLink's App
   Library. They ask for:
   - an icon
   - a **terms of use** URL (the site has none yet)
   - the privacy policy URL
   - a data sharing policy URL (/privacy covers it, or make a page)
   - a review call

**What happens on sign-in.** A ClassLink student who signs in gets a
student account with no email. Until their teacher's class roster comes
through ClassLink, they type their class code once (/account shows "Join
your class"). A teacher gets an ordinary account. It never signs in to an
existing account with the same email, since a district can put any email
on a ClassLink account.

**Whole rosters from ClassLink** (OneRoster, through ClassLink's Roster
Server) come per district: each district must approve abcSightReading and
share its data. Once one does, the Partner Portal API key lists the
districts that have, and the code can import each teacher's classes. That
is the next piece of work, best started with a real district.
