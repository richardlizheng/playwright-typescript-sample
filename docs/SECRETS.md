# Credentials and secrets

The rule is the same everywhere: **the code reads names, the environment supplies values.**
Tests and page objects call [`utils/env.ts`](../utils/env.ts). They never contain a URL or a password.
If a value is missing, the run stops at once with `Missing env variable NAME. Copy .env.example to .env and fill it in.`

The same seven variable names are used on every platform below.

## 1. Local: `.env`

```bash
cp .env.example .env   # then fill in the empty values
```

- `.env.example` is committed. It lists every name, with placeholders only.
- `.env` is in [`.gitignore`](../.gitignore), so it never reaches Git.
- `dotenv` loads it in [`utils/env.ts`](../utils/env.ts). In CI there is no `.env` file, and real environment variables are used instead.

## 2. GitHub Actions: secrets and variables

*Settings → Secrets and variables → Actions*

| Kind | Used for | Example |
|---|---|---|
| **Secrets** | Usernames, passwords, tokens. Masked in logs. Not passed to workflows from forks. | `SAUCE_PASSWORD`, `BOOKER_PASSWORD` |
| **Variables** | Non-secret settings. Visible in logs. | `SAUCE_BASE_URL`, `INTERNET_BASE_URL` |

The workflow maps them to environment variables for one step only.
See [`playwright.yml`](../.github/workflows/playwright.yml):

```yaml
- run: npx playwright test
  env:
    SAUCE_BASE_URL: ${{ vars.SAUCE_BASE_URL }}
    SAUCE_PASSWORD: ${{ secrets.SAUCE_PASSWORD }}
```

## 3. Jenkins: Credentials + `withCredentials`

Store the values in *Manage Jenkins → Credentials* (type *Username with password*).
They are only available inside the block, and Jenkins masks them in the console output.

```groovy
withCredentials([usernamePassword(credentialsId: 'sauce-demo',
                                  usernameVariable: 'SAUCE_USER',
                                  passwordVariable: 'SAUCE_PASSWORD')]) {
  sh 'npx playwright test'
}
```

## 4. Azure DevOps: secret variables or Key Vault

- **Secret pipeline variables** (or a *variable group* marked secret). Secret values are **not** passed to
  scripts automatically. Map each one in `env:`:

  ```yaml
  - script: npx playwright test
    env:
      SAUCE_PASSWORD: $(SAUCE_PASSWORD)
  ```

- **Azure Key Vault**: link the vault to a variable group, or use the `AzureKeyVault@2` task.
  The secrets then work like the secret variables above. Rotation happens in the vault, not in the pipeline.

## Why `.auth/` is git-ignored

[`tests/auth.setup.ts`](../tests/auth.setup.ts) logs in once and saves the browser state to `.auth/user.json`.
That file holds a **live session cookie**. Anyone with the file is logged in as that user until the session ends.
So it is treated like a password: created at run time, never committed, deleted with the workspace.

## Note about this repo

The practice sites publish their demo credentials on their own pages.
I still keep them in `.env` and CI secrets to show the pattern I use for real credentials.
