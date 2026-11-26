import { describe, expect, it } from "vitest";
import {
  channelTag,
  cleanCandidate,
  cleanProfile,
  dmLine,
  enrichPrompt,
  enrichRefusal,
  foundOf,
  foundPerson,
  handleOf,
  postOn,
  profileUrl,
  shortlistOf,
  uniqueIdOf,
  webLink,
} from "../lib/recruit/found";
import { contactRefusal, followUpOf } from "../lib/recruit/follow-ups";

const maya = {
  name: "Maya Park",
  platform: "instagram",
  handle: "@Maya.Park_27",
  said: "Just toured two nursing schools, so excited to apply this fall!",
  post_url: "https://www.instagram.com/p/Cabc123/?igsh=tracking#frag",
  why: "Says she is applying to nursing programs this fall.",
  program: "Nursing",
  city: "Dayton",
  state: "Ohio",
  graduation_year: "2027",
};

describe("handles and links", () => {
  it("reads a handle the way the channel writes it, and refuses what is not one", () => {
    expect(handleOf("instagram", "@Maya.Park_27")).toBe("maya.park_27");
    expect(handleOf("reddit", "u/Future_RN-27")).toBe("future_rn-27");
    expect(handleOf("reddit", "/u/ab")).toBe("");
    for (const bad of ["maya park", "maya/../x", "a".repeat(31), "", null, "maya?x=1"])
      expect(handleOf("instagram", bad)).toBe("");
  });

  it("builds the profile address itself, and one id per person and channel", () => {
    expect(profileUrl("instagram", "maya.park_27")).toBe("https://www.instagram.com/maya.park_27/");
    expect(profileUrl("reddit", "future_rn-27")).toBe("https://www.reddit.com/user/future_rn-27/");
    expect(uniqueIdOf("instagram", "maya.park_27")).toBe("instagram:maya.park_27");
  });

  it("keeps a post link only on that channel's own https host, without its query", () => {
    expect(postOn("instagram", maya.post_url)).toBe("https://www.instagram.com/p/Cabc123/");
    expect(postOn("reddit", "https://old.reddit.com/r/nursing/comments/1abc/x/?utm=1")).toBe(
      "https://old.reddit.com/r/nursing/comments/1abc/x/",
    );
    for (const bad of [
      "http://www.instagram.com/p/x/",
      "https://instagram.com.evil.example/p/x/",
      "https://evil.example/www.instagram.com/p/x/",
      "https://user@www.instagram.com/p/x/",
      "https://www.instagram.com:8443/p/x/",
      "data:text/html,x",
      "https://www.reddit.com/r/x/",
      "",
    ])
      expect(postOn("instagram", bad)).toBe("");
  });
});

describe("cleanCandidate", () => {
  it("keeps a candidate with the handle normalized and the link cleaned", () => {
    expect(cleanCandidate(maya)).toEqual({
      ...maya,
      handle: "maya.park_27",
      post_url: "https://www.instagram.com/p/Cabc123/",
    });
  });

  it("says why it cannot keep one", () => {
    const why = (over: object) => cleanCandidate({ ...maya, ...over });
    expect(why({ platform: "facebook" })).toMatch(/channel is one of: instagram, reddit/);
    expect(why({ handle: "not a handle" })).toMatch(/not a handle on Instagram/);
    expect(why({ said: " " })).toBe('"said" is missing.');
    expect(why({ why: "" })).toBe('"why" is missing.');
    expect(why({ said: "x".repeat(501) })).toMatch(/"said" is longer than 500/);
    expect(why({ graduation_year: "next year" })).toMatch(/four digits/);
    expect(why({ post_url: "https://evil.example/p/x" })).toMatch(/not an https link on Instagram/);
    expect(cleanCandidate(null)).toMatch(/channel/);
  });

  it("drops what it was not asked for", () => {
    const out = cleanCandidate({
      ...maya,
      email: "maya@x.io",
      race: "x",
      profile_url: "https://x",
    });
    expect(out).not.toHaveProperty("email");
    expect(out).not.toHaveProperty("race");
    expect(out).not.toHaveProperty("profile_url");
  });
});

describe("shortlistOf", () => {
  const list = {
    criteria: "Nursing, Ohio",
    source: "#futurenurse",
    basis: "Public posts",
    at: "t",
  };

  it("reads a stored shortlist, leaving out anyone who is no longer valid", () => {
    const stored = {
      shortlist: { ...list, proposed: 3, people: [maya, { ...maya, handle: "?" }] },
    };
    const out = shortlistOf({ metadata: stored });
    expect(out).toMatchObject({ ...list, proposed: 3 });
    expect(out?.people.map((p) => p.handle)).toEqual(["maya.park_27"]);
  });

  it("is null for any other activity", () => {
    expect(shortlistOf({ metadata: { follow_up: {} } })).toBeNull();
    expect(shortlistOf({})).toBeNull();
  });
});

describe("a found person", () => {
  const list = { criteria: "Nursing, Ohio", source: "#futurenurse", basis: "Public posts" };
  const candidate = cleanCandidate(maya);
  if (typeof candidate === "string") throw new Error(candidate);
  const person = foundPerson(candidate, list, new Date("2027-01-05T10:00:00Z"));

  it("is created with one id per handle, no email, and where they came from", () => {
    expect(person).toEqual({
      name: "Maya Park",
      unique_id: "instagram:maya.park_27",
      job_title: "Nursing",
      lifecycle_stage: "lead",
      metadata: {
        found: {
          platform: "instagram",
          handle: "maya.park_27",
          profile_url: "https://www.instagram.com/maya.park_27/",
          said: maya.said,
          post_url: "https://www.instagram.com/p/Cabc123/",
          ...list,
          at: "2027-01-05T10:00:00.000Z",
        },
        city: "Dayton",
        state: "Ohio",
        graduation_year: "2027",
      },
    });
  });

  it("reads back with the profile built from the handle, whatever link was stored", () => {
    const stored = person.metadata?.found as Record<string, unknown>;
    const tampered = { metadata: { found: { ...stored, profile_url: "https://evil.example/x" } } };
    expect(foundOf(tampered)?.profile_url).toBe("https://www.instagram.com/maya.park_27/");
    expect(
      foundOf({ metadata: { found: { ...stored, post_url: "data:text/html,x" } } }),
    ).not.toHaveProperty("post_url");
    // Someone found through a list, as before: no channel.
    expect(
      foundOf({ metadata: { found: { source: "a fair list", basis: "b", at: "t" } } }),
    ).toEqual({
      source: "a fair list",
      basis: "b",
      at: "t",
    });
    expect(foundOf({ metadata: {} })).toBeNull();
  });

  it("can be messaged on the channel while they have a profile and have not said stop", () => {
    expect(contactRefusal(person, "dm")).toBe("");
    // Never at an address they published, even once their record has one.
    const social = "They were found on a social channel: they are written to there, by hand.";
    expect(contactRefusal(person, "email")).toBe(social);
    expect(contactRefusal({ ...person, primary_email: "jo@x.io" }, "email")).toBe(social);
    expect(
      contactRefusal(
        {
          ...person,
          contact_numbers: ["+15550100"],
          metadata: { ...person.metadata, sms_consent: true },
        },
        "text",
      ),
    ).toBe(social);
    expect(contactRefusal({ metadata: { ...person.metadata, opted_out: true } }, "dm")).toBe(
      "They asked not to be contacted.",
    );
    expect(contactRefusal({ primary_email: "a@x.io", metadata: {} }, "dm")).toBe(
      "There is no profile on file.",
    );
  });

  it("gets a line saying who writes, where they were seen, and how to stop", () => {
    expect(dmLine("Northfield University", "reddit")).toBe(
      "This is the admissions team at Northfield University. We saw your public post on Reddit. If you would rather not hear from us, say so and we will not message you again.",
    );
  });
});

describe("followUpOf", () => {
  it("reads a message for the channel, and the step it answers", () => {
    expect(
      followUpOf({ metadata: { follow_up: { channel: "dm", kind: "introduction", step: "x" } } }),
    ).toEqual({ channel: "dm", kind: "introduction", step: "x" });
    expect(followUpOf({ metadata: { follow_up: { channel: "fax" } } })?.channel).toBe("email");
    expect(
      followUpOf({
        metadata: { follow_up: { channel: "email", discarded: { at: "t", by: "x" } } },
      }),
    ).toMatchObject({ discarded: true });
  });
});

describe("X and YouTube", () => {
  it("read each channel's handles, and build the profile and the tag from them", () => {
    expect(handleOf("x", "@Maya_P27")).toBe("maya_p27");
    expect(handleOf("x", "maya.p")).toBe("");
    expect(handleOf("x", "a".repeat(16))).toBe("");
    expect(handleOf("youtube", "@Maya.Park-27")).toBe("maya.park-27");
    expect(handleOf("youtube", "@mañana_rn")).toBe("mañana_rn");
    expect(handleOf("youtube", "ab")).toBe("");
    expect(profileUrl("x", "maya_p27")).toBe("https://x.com/maya_p27");
    expect(profileUrl("youtube", "mañana_rn")).toBe("https://www.youtube.com/@ma%C3%B1ana_rn");
    expect(channelTag("youtube")).toBe("Found on YouTube");
  });

  it("keep a YouTube comment's video and comment ids, and nothing else in the query", () => {
    expect(
      postOn("youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ&lc=UgxK-1.a&si=track&t=30"),
    ).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ&lc=UgxK-1.a");
    expect(postOn("youtube", "https://youtube.com/watch?v=%3Cscript%3E")).toBe(
      "https://youtube.com/watch",
    );
    expect(postOn("x", "https://twitter.com/maya_p27/status/1234?s=20")).toBe(
      "https://twitter.com/maya_p27/status/1234",
    );
    expect(postOn("x", "https://x.com.evil.example/maya/status/1")).toBe("");
    expect(postOn("youtube", "https://:pw@www.youtube.com/watch?v=x")).toBe("");
  });

  it("never write to someone found on YouTube, which has no direct messages", () => {
    const on = (platform: string) => ({
      primary_email: "",
      contact_numbers: [],
      metadata: { found: { platform, handle: "maya_p27", source: "s", basis: "b", at: "t" } },
    });
    expect(contactRefusal(on("x"), "dm")).toBe("");
    expect(contactRefusal(on("youtube"), "dm")).toMatch(/YouTube has no direct messages/);
  });
});

describe("a profile read", () => {
  it("keeps short, plain fields and links on the right hosts", () => {
    expect(
      cleanProfile("instagram", {
        bio: " Future nurse ",
        website: "https://linktr.ee/maya?utm_source=ig#x",
        city: "Dayton",
        graduation_year: "2027",
        interests: ["anatomy", " volunteering "],
        posts: [
          { said: "Shadowed an ER nurse", post_url: "https://www.instagram.com/p/C1/?igsh=1" },
        ],
        followers: 1200,
      }),
    ).toEqual({
      bio: "Future nurse",
      website: "https://linktr.ee/maya",
      city: "Dayton",
      graduation_year: "2027",
      interests: ["anatomy", "volunteering"],
      posts: [{ said: "Shadowed an ER nurse", post_url: "https://www.instagram.com/p/C1/" }],
    });
  });

  it("says why it cannot keep one", () => {
    const why = (raw: object) => cleanProfile("reddit", raw);
    expect(why({ bio: "x".repeat(301) })).toMatch(/"bio" is longer than 300/);
    expect(why({ website: "ftp://linktr.ee/maya" })).toMatch(/not an https link/);
    expect(why({ website: "https://localhost/x" })).toMatch(/not an https link/);
    expect(why({ graduation_year: "27" })).toMatch(/four digits/);
    expect(why({ interests: ["a", "b", "c", "d", "e", "f"] })).toMatch(/up to 5/);
    expect(why({ interests: "nursing" })).toMatch(/up to 5/);
    expect(why({ posts: [{ said: "" }] })).toMatch(/1 to 500/);
    expect(why({ posts: [{ said: "x", post_url: "https://evil.example/r/x" }] })).toMatch(
      /on Reddit/,
    );
    expect(why({})).toMatch(/Nothing was read/);
    expect(webLink("https://user:pw@linktr.ee/x")).toBe("");
  });

  it("reads back through the same checks, with when it was read", () => {
    const found = {
      platform: "instagram",
      handle: "maya.park_27",
      source: "s",
      basis: "b",
      at: "t",
      profile: {
        bio: "Future nurse",
        website: "http://evil.example",
        at: "2027-03-10T12:00:00.000Z",
      },
    };
    // A tampered link drops the whole read: nothing stored is trusted.
    expect(foundOf({ metadata: { found } })).not.toHaveProperty("profile");
    expect(
      foundOf({ metadata: { found: { ...found, profile: { bio: "Future nurse", at: "2027" } } } })
        ?.profile,
    ).toEqual({ bio: "Future nurse", at: "2027" });
  });

  it("is refused without a basis, for a merged record, off a social channel, or after a stop", () => {
    const basis = "They posted in public that they want to study nursing.";
    const found = { platform: "reddit", handle: "maya_p", source: "s", basis: "b", at: "t" };
    expect(enrichRefusal({ active: true, metadata: { found } }, basis)).toBe("");
    expect(enrichRefusal({ active: true, metadata: { found } }, "short")).toMatch(/Settings/);
    expect(enrichRefusal({ active: false, metadata: { found } }, basis)).toMatch(/merge/);
    expect(
      enrichRefusal(
        { active: true, metadata: { found: { source: "s", basis: "b", at: "t" } } },
        basis,
      ),
    ).toMatch(/social channel/);
    expect(enrichRefusal({ active: true, metadata: { found, opted_out: true } }, basis)).toMatch(
      /not to be contacted/,
    );
  });

  it("asks the agent to read their profile on that channel and nothing else", () => {
    const person = (platform: string, handle: string) => ({
      id: "p1",
      name: "Maya Park",
      metadata: { found: { platform, handle, source: "s", basis: "b", at: "t" } },
    });
    const ig = enrichPrompt(person("instagram", "maya.park_27"));
    expect(ig).toMatch(
      /apify--instagram-scraper with directUrls \["https:\/\/www\.instagram\.com\/maya\.park_27\/"\] and resultsType "details"/,
    );
    expect(ig).toMatch(/enrich_found_prospect with prospect_id p1/);
    expect(ig).toMatch(/Read nothing else/);
    // A name came from a stranger's page: it never reaches the prompt.
    expect(ig).not.toMatch(/Maya Park/);
    expect(enrichPrompt(person("reddit", "maya_p"))).toMatch(
      /trudax--reddit-scraper-lite with startUrls \[\{"url": "https:\/\/www\.reddit\.com\/user\/maya_p\/"\}\]/,
    );
    expect(enrichPrompt(person("x", "maya_p"))).toMatch(
      /apidojo--twitter-user-scraper with twitterHandles \["maya_p","maya_p","maya_p","maya_p","maya_p"\] and maxItems 5/,
    );
    expect(enrichPrompt(person("youtube", "maya.p"))).toMatch(
      /streamers--youtube-scraper with startUrls \[\{"url": "https:\/\/www\.youtube\.com\/@maya\.p"\}\] and maxResults 1/,
    );
    expect(enrichPrompt({ id: "p2", metadata: {} })).toBe("");
  });
});
