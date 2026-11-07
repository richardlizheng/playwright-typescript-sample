# Azure DevOps pipeline

[`azure-pipelines.yml`](../azure-pipelines.yml) runs the same steps as the
[GitHub Actions workflow](../.github/workflows/playwright.yml): `npm ci` → lint → typecheck →
install Chrome and Edge → run all projects → triage on failure → publish results and reports.
The code stays on GitHub; Azure Pipelines builds it from there.

## 1. Variable group

*Pipelines → Library → + Variable group*, named **`playwright-sample`** (the YAML refers to this name).

| Name | Secret? |
|---|---|
| `SAUCE_BASE_URL`, `INTERNET_BASE_URL`, `BOOKER_API_URL` | no |
| `SAUCE_USER`, `SAUCE_PASSWORD`, `BOOKER_USER`, `BOOKER_PASSWORD` | yes (lock icon) |

All seven must exist. An undefined `$(NAME)` is passed to the script as the literal text `$(NAME)`,
so `utils/env.ts` would not catch it as missing. To keep the values in Azure Key Vault instead,
turn on *Link secrets from an Azure key vault* in the same group.

## 2. Create the pipeline

1. *Pipelines → New pipeline → GitHub (YAML)*.
2. Sign in to GitHub and install the **Azure Pipelines** GitHub App on this repository only.
   The app reports build status back to commits and pull requests.
3. Select the repository → *Existing Azure Pipelines YAML file* → branch `main`, path `/azure-pipelines.yml`.
4. *Run*. On the first run, Azure DevOps asks for permission to use the variable group: choose *Permit*.

New organizations may have no free Microsoft-hosted parallel job for private projects. If the run stays
queued with a parallelism message, request the free grant (<https://aka.ms/azpipelines-parallelism-request>),
make the project public, or register a self-hosted agent.

## 3. Pull request gate

The YAML already triggers on pull requests to `main`. To block merging on failure, add the pipeline's
check as required in GitHub: *Settings → Branches → Branch protection rule for `main` →
Require status checks → the Azure Pipelines check for this pipeline*.

## What a run shows

| Where | What |
|---|---|
| *Tests* tab | JUnit results from `reports/junit.xml`: pass/fail per test, retries, history across runs |
| Artifacts | `playwright-report-<attempt>` (HTML report, traces, video), `reports-<attempt>` (JSON results, `self-healing.json`) |
| Job log | `npm run triage` summary when a test fails; self-healing summary when a locator was recovered |

Download the HTML report artifact and open it with `npx playwright show-report <folder>`.

## Differences from GitHub Actions

| Topic | GitHub Actions | Azure Pipelines |
|---|---|---|
| `CI` variable | set by the runner | not set (only `TF_BUILD`), so the YAML sets `CI=true` for retries and `forbidOnly` |
| Secrets | `${{ secrets.NAME }}` | secret variables, mapped one by one in `env:` |
| Self-healing mode | `github.event_name == 'pull_request'` | `Build.Reason == 'PullRequest'` |
| npm cache | `setup-node` with `cache: npm` | `Cache@2` keyed on `package-lock.json` |
| Report upload | `upload-artifact`, kept 14 days | `PublishPipelineArtifact@1`, kept by the project's retention policy |
| Test results UI | none built in | *Tests* tab via `PublishTestResults@2` |
