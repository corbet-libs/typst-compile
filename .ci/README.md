# Selected CI check

Checks JavaScript syntax in server.js without installing dependencies. The existing test selector remains separate; this does not run the service, render documents or deploy it.

Both providers use `.ci/ccid.toml`; the public hosted wrapper delegates to the
reviewed shared ccid workflow. Prefer eligible GHA through the existing dispatcher:

```sh
crow-ci run --repo . --branch master --workflow ccid --provider auto --var CHECKS=check
```

The dispatcher reconciles existing work and falls back to Crow if hosted execution
or its verified portable executor is unavailable. A real test failure stays failed.
The hosted budget is one job, one test thread, an 8192 MiB reserve and a 120-second
deadline. Crow retains its existing resource controls and persistent caches.
Neither route installs tools for this check; no Rust toolchain refresh is needed.

Both adapters require manual dispatch with exact staged or verified inputs; a plain
push does not run this selected check. A reviewed wrapper or changed executor pin
is configuration evidence, not a successful hosted run or product runtime proof.
At this review, the portable ccid bootstrap had no hosted run and its release asset
was absent. Crow remains the available execution route until that prerequisite is
actually satisfied.

The existing README states that production automatically deploys every push to
master. Review that existing deployment boundary before publishing this change;
a CI skip marker is not evidence that a deployment was suppressed.
