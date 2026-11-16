import { describe, expect, test } from "bun:test";
import { checkOneRosterClass, keyOf, oneRosterClassOf, parseCsv, readOneRoster, rosterSourceFor } from "../../src/lib/oneroster";

const files = () => ({
  "manifest.csv": "propertyName,value\nmanifest.version,1.0\noneroster.version,1.1\n",
  "orgs.csv": "sourcedId,status,dateLastModified,name,type,identifier,parentSourcedId\nsch1,,,Lantrip Elementary,school,,\n",
  "classes.csv":
    "sourcedId,status,dateLastModified,title,grades,courseSourcedId,classCode,classType,location,schoolSourcedId,termSourcedIds,subjects,subjectCodes,periods\n" +
    'c2,,,"Music 2A, Day A",,co1,2A,scheduled,,sch1,t1,Music,,\n' +
    "c10,,,Music 10A,,co1,10A,scheduled,,sch1,t1,Music,,\n" +
    "cEmpty,,,Nobody,,co1,,scheduled,,sch1,t1,,,\n",
  "users.csv":
    "sourcedId,status,dateLastModified,enabledUser,orgSourcedIds,role,username,userIds,givenName,familyName,middleName,identifier,email,sms,phone,agentSourcedIds,grades,password\n" +
    "u1,,,true,sch1,student,,,Maria,Garcia,,1234567,maria@school.org,,,,03,\n" +
    "u2,,,true,sch1,student,,,Bao,Nguyen,,7654321,,,,,03,\n" +
    "u3,tobedeleted,,true,sch1,student,,,Gone,Student,,,,,,,03,\n" +
    "u4,,,false,sch1,student,,,Off,Student,,,,,,,03,\n" +
    "t1,,,true,sch1,teacher,,,Blaine,Cowen,,,blaine@school.org,,,,,\n",
  "enrollments.csv":
    "sourcedId,status,dateLastModified,classSourcedId,schoolSourcedId,userSourcedId,role,primary,beginDate,endDate\n" +
    "e1,,,c2,sch1,u2,student,false,,\n" +
    "e2,,,c2,sch1,u1,student,false,,\n" +
    "e3,,,c2,sch1,u3,student,false,,\n" +
    "e4,,,c2,sch1,u4,student,false,,\n" +
    "e5,,,c2,sch1,t1,teacher,true,,\n" +
    "e6,,,c10,sch1,u1,student,false,,\n",
});

describe("OneRoster", () => {
  test("CSV: quoted commas, doubled quotes, line breaks, CRLF and a BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\n"two\nlines",z')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["two\nlines", "z"],
    ]);
  });

  test("classes with their enrolled students, names only, in title order", () => {
    const { classes, warnings } = readOneRoster(files());
    expect(warnings).toEqual([]);
    expect(classes.map((c) => c.title)).toEqual(["Music 2A, Day A", "Music 10A"]);
    const [c2] = classes;
    expect(c2.key).toBe(keyOf("sch1", "c2"));
    expect(c2.school).toBe("Lantrip Elementary");
    // Teachers, deleted and switched-off users are left out; sorted by last name.
    expect(c2.students).toEqual([
      { key: "sch1/u1", first: "Maria", last: "Garcia", name: "Maria Garcia" },
      { key: "sch1/u2", first: "Bao", last: "Nguyen", name: "Bao Nguyen" },
    ]);
    // Nothing but names: no emails, SIS ids or grades.
    expect(JSON.stringify(classes)).not.toMatch(/maria@|1234567|"03"/);
  });

  test("files inside a folder of the zip are found", () => {
    const nested = Object.fromEntries(Object.entries(files()).map(([k, v]) => [`roster/${k.toUpperCase()}`, v]));
    expect(readOneRoster(nested).classes).toHaveLength(2);
  });

  test("a file set that is not OneRoster says what is missing", () => {
    expect(() => readOneRoster({ "users.csv": files()["users.csv"] })).toThrow(/classes\.csv, enrollments\.csv are missing/);
  });

  test("roster source round trip", () => {
    expect(oneRosterClassOf(rosterSourceFor("sch1/c2"))).toBe("sch1/c2");
    expect(oneRosterClassOf("google:123")).toBeNull();
  });

  test("the server's check keeps names only and refuses a nameless student", () => {
    const ok = checkOneRosterClass({ key: "k", title: "2A", students: [{ key: "s", first: " Ana ", last: "Diaz", email: "x@y.z" }] });
    expect(ok).toEqual({ ok: true, value: { key: "k", title: "2A", school: "", students: [{ key: "s", first: "Ana", last: "Diaz", name: "Ana Diaz" }] } });
    expect(checkOneRosterClass({ key: "k", title: "2A", students: [{ key: "s", first: "", last: "" }] }).ok).toBe(false);
    expect(checkOneRosterClass({ title: "2A", students: [] }).ok).toBe(false);
  });
});
