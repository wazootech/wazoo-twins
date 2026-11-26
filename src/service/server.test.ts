import { test } from "node:test";
import { assertEquals } from "../testutil/assert.ts";
import { parseServerArgs } from "./server.ts";

test("server: parseServerArgs handles --once forms", () => {
  assertEquals(parseServerArgs([]), {});
  assertEquals(parseServerArgs(["--once", "what's open?"]), {
    once: "what's open?",
  });
  assertEquals(parseServerArgs(["--once=what's open?"]), {
    once: "what's open?",
  });
  assertEquals(parseServerArgs(["--once"]), {});
});
