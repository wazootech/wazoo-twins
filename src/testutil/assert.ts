/**
 * Assertion helpers for the test suite, built on `node:assert/strict` so the
 * same tests run under `bun test` (no `jsr:@std/assert`).
 *
 * The names and argument order match `@std/assert`, which keeps the test
 * bodies unchanged. Like std, `assertThrows` and `assertRejects` take an
 * expected error class and a substring the message must contain.
 */
import nodeAssert from "node:assert/strict";

type ErrorClass = new (...args: never[]) => Error;

/** Fail unless `expr` is truthy. */
export function assert(expr: unknown, msg?: string): asserts expr {
  if (msg === undefined) nodeAssert.ok(expr);
  else nodeAssert.ok(expr, msg);
}

/** Fail unless `actual` deep-strictly equals `expected`. */
export function assertEquals(
  actual: unknown,
  expected: unknown,
  msg?: string,
): void {
  if (msg === undefined) nodeAssert.deepStrictEqual(actual, expected);
  else nodeAssert.deepStrictEqual(actual, expected, msg);
}

/** Fail unless `actual` contains the substring `expected`. */
export function assertStringIncludes(
  actual: string,
  expected: string,
  msg?: string,
): void {
  if (!actual.includes(expected)) {
    nodeAssert.fail(
      msg ??
        `Expected ${JSON.stringify(actual)} to include ${JSON.stringify(
          expected,
        )}`,
    );
  }
}

function checkError(
  error: unknown,
  errorClass: ErrorClass,
  msgIncludes: string | undefined,
): void {
  nodeAssert.ok(
    error instanceof errorClass,
    `Expected error to be instance of ${errorClass.name}, got ${String(error)}`,
  );
  if (msgIncludes !== undefined) {
    assertStringIncludes((error as Error).message, msgIncludes);
  }
}

/** Fail unless `fn` throws an `errorClass` whose message includes `msgIncludes`. */
export function assertThrows(
  fn: () => unknown,
  errorClass: ErrorClass = Error,
  msgIncludes?: string,
): void {
  try {
    fn();
  } catch (error) {
    checkError(error, errorClass, msgIncludes);
    return;
  }
  nodeAssert.fail("Expected function to throw");
}

/** Fail unless `fn` rejects with an `errorClass` whose message includes `msgIncludes`. */
export async function assertRejects(
  fn: () => Promise<unknown>,
  errorClass: ErrorClass = Error,
  msgIncludes?: string,
): Promise<void> {
  try {
    await fn();
  } catch (error) {
    checkError(error, errorClass, msgIncludes);
    return;
  }
  nodeAssert.fail("Expected function to reject");
}
