// Entry point so `node --test scripts/__tests__` works on Node 22, where a
// directory argument is resolved like a module (index.js) instead of being scanned.
Promise.all([import("./validate.test.mjs"), import("./lint-wording.test.mjs"), import("./evals-check.test.mjs")]).catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
