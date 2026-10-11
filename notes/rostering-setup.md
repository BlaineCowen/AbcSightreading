# School setup: Google Classroom, ClassLink, email, legal pages

A checklist to work down in order. Each step says where to click and what to
type. Steps marked **Done** were finished on 10 October 2026.

How the code works is in CLAUDE.md, under "Rosters from Google Classroom and
ClassLink".

---

## 0. Before anything: get this code live

- [ ] **Add the new database column.** In Claude Code, type
      `! bun run db:deploy`. It should say the migration
      `20261010120000_class_roster_source` was applied. Claude then pushes
      to dev.
- [ ] **Try it on dev** (dev.abc-sightreading.com) after step 1.
- [ ] **Push to main** when you're happy. Google and ClassLink check the
      /privacy and /terms links against the live site, so do this before
      step 1d and step 3.

---

## 1. Google (sign-in and Google Classroom)

Google Cloud console, project **abc-sightreading**, under Google Auth
Platform: https://console.cloud.google.com/auth/overview?project=abc-sightreading

- [x] **Done: Google Classroom API turned on.**
- [x] **Done: scopes added** (Data Access): openid, email, profile,
      `classroom.courses.readonly` and `classroom.rosters.readonly`.
      Google lists the two Classroom ones as non-sensitive, so there should
      be no long review for them.
- [x] **Done: branding** (Branding):
  - App name: abcSightReading
  - Home page: https://www.abc-sightreading.com
  - Privacy policy: https://www.abc-sightreading.com/privacy
  - Terms: https://www.abc-sightreading.com/terms
- [x] **Done: redirect URIs** (Clients > abc-sightreading): the live site
      (with and without www), localhost:4321, the dev branch's vercel.app
      address and `https://dev.abc-sightreading.com/api/auth/callback/google`
      (added 10 October 2026, after a redirect_uri_mismatch on dev).
- [ ] **1a. Publish the app. This is important today.** On the Audience
      page, the app is in **Testing** with no test users. While it is,
      Google lets nobody but listed test users sign in, so "Continue with
      Google" fails for everyone on the live site. The page shows 0 users
      ever. Click **Publish app**, then **Confirm**. With only basic and
      non-sensitive scopes, it goes live straight away.
- [ ] **1b. Logo (optional).** Branding > App logo: a 120×120 PNG. Adding
      a logo makes Google want a brand verification (a few days), so leave
      it until you have time for that.
- [ ] **1c. Domain ownership.** For verification later, abc-sightreading.com
      must be verified in Search Console under blaine.cowen@gmail.com. If
      you added the site to Search Console for SEO already, it is.
- [ ] **1d. Test the Classroom import.** You need two Google accounts: your
      Gmail as the teacher, and any second Gmail as a student.
  1. As the teacher, go to classroom.google.com, then **+** > Create class
     (call it "Test choir"). Copy the class code.
  2. In another browser profile, sign in as the second account and join
     with that code.
  3. On dev, sign in as your educator account. On /account, under
     Students, a class card has **Import from Google Classroom**.
  4. Click it, then **Connect Google Classroom**. Pick your teacher Google
     account, allow both permissions, then pick "Test choir".
  5. The student appears with a "Google" badge.
  6. In the second profile, go to dev /login, choose the **Student** tab,
     then **Sign in with Google**. You should land on the student's
     account page.

- [ ] **1e. Grades to Classroom: verification (when you want it public).**
      Posting assignments and sending grades asks teachers for one more
      permission, `classroom.coursework.students`, which Google counts as
      sensitive. It works now, but each teacher sees Google's "this app isn't
      verified" warning on that step, and at most 100 people can grant it.
      To lift that: publish the app first (1a), then Data Access > Add or
      remove scopes > add `.../auth/classroom.coursework.students`, and
      Verification Center > submit. Google asks why you need it (paste:
      "Teachers post a practice assignment to their Google Classroom class
      and send each student's score there as a draft grade, which the teacher
      reviews and returns.") and a short screen recording of that flow. It
      takes a few weeks. Don't add the scope before publishing (1a): a
      sensitive scope on the list can hold the publish up.

### What a school's IT department does (for students under 18)

Google blocks under-18 school accounts from apps their admin hasn't
allowed. Teachers can send IT this:

> Please allow **abcSightReading** for students. Admin console > Security >
> Access and data control > API controls > App access control > Manage
> third-party app access > Configure new app > search the OAuth client ID
> **451534850151-0ku7…** (full ID under Google Auth Platform > Clients) >
> choose the students' organisational unit > **Trusted**. Students only
> sign in with their name and Google ID; the app never asks students for
> Classroom, Drive or email access.

Some districts already allow any app that only asks for basic sign-in. In
those districts it just works.

---

## 2. Email at abc-sightreading.com

Mail for the domain already forwards through Porkbun (its MX records are in
place, and feedback@ is in use). The site now shows two more addresses:
**support@** (on /terms) and **privacy@** (on /privacy).

- [x] **Done: the forwards** (Porkbun > Domain Management >
      abc-sightreading.com > **Email** > Email Forwarding):
  - `support` to blaine.cowen@gmail.com
  - `privacy` to blaine.cowen@gmail.com
  - `partners` to blaine.cowen@gmail.com (for ClassLink, step 3)
- [ ] **2b. Check them:** send yourself a test to each from another account.

ClassLink's partner sign-up wants an address at the company domain, and it
emails a code to confirm it. A forward is enough to receive that. You only
need a real mailbox (Porkbun Email about $24 a year, or Google Workspace)
if you want to *send* mail as @abc-sightreading.com.

---

## 3. ClassLink

- [ ] **3a. Sign up** at https://www.classlink.com/partners > "Become a
      Partner" or "Partner Portal", using **partners@abc-sightreading.com**
      (step 2a). It is free.
- [ ] **3b. Create the app** in the Partner Portal, as an OAuth2 / OpenID
      Connect SSO app:
  - Name: abcSightReading
  - Redirect URIs (all three):
    - `https://www.abc-sightreading.com/api/auth/callback/classlink`
    - `https://dev.abc-sightreading.com/api/auth/callback/classlink`
    - `http://localhost:4321/api/auth/callback/classlink`
  - Launch URL (where the LaunchPad tile goes):
    `https://www.abc-sightreading.com/classlink`
  - Scope: `profile`
  - Terms: https://www.abc-sightreading.com/terms
  - Privacy: https://www.abc-sightreading.com/privacy
  - Data sharing policy: https://www.abc-sightreading.com/privacy#sharing
- [ ] **3c. Put in the keys.** ClassLink gives a Client ID and a Client
      Secret. Add them in Vercel > abc-sightreading > Settings > Environment
      Variables, for Production and Preview:
  - `CLASSLINK_CLIENT_ID`
  - `CLASSLINK_CLIENT_SECRET`

  Then redeploy. To use them locally, also add both lines to `.env`. "Sign
  in with ClassLink" then appears on /login.
- [ ] **3d. Test** with ClassLink's test district from the portal: sign in
      as a test student, then type a class code once on /account.
- [ ] **3e. Request certification** in the portal (an icon, plus a review
      call). After that, districts can find abcSightReading in ClassLink's
      App Library.
- [ ] **3f. Later, with a real district:** whole rosters from ClassLink
      (OneRoster). The district approves abcSightReading in ClassLink, and
      Claude builds the import against it.

---

## 4. Legal pages

- [x] **Done: /privacy and /terms are written,** linked in the footer and
      under the sign-up form.
- [ ] **4a. Have someone read them.** A lawyer who knows school data, or
      your district's own data privacy office, should read /privacy and
      /terms once before a district relies on them.
- [ ] **4b. Student data privacy agreements.** Districts in Texas use the
      TX-NDPA through the Student Data Privacy Consortium
      (privacy.a4l.org). When a district sends one, sign it; the privacy
      page already offers to.
