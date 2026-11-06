import { assertEquals } from "@std/assert";
import { parseServerArgs } from "./server.ts";

Deno.test("server: parseServerArgs handles --once forms", () => {
  assertEquals(parseServerArgs([]), {});
  assertEquals(parseServerArgs(["--once", "what's open?"]), {
    once: "what's open?",
  });
  assertEquals(parseServerArgs(["--once=what's open?"]), {
    once: "what's open?",
  });
  assertEquals(parseServerArgs(["--once"]), {});
});
