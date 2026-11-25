# Plan: Move build and deploy from Jenkins to GitHub Actions and retire the Jenkins VM

## Context
A monorepo with 9 services and one Jenkinsfile of about 300 lines. Jenkins runs on a single VM inside the
production VPC and deploys over SSH to hosts that have no public address. A full build takes 38 minutes.
The `main` branch is protected with one required status check, `ci/jenkins`. The repository accepts pull
requests from forks.

## Steps
S1. Write a converter in Rust that parses Jenkins pipeline Groovy and emits GitHub Actions workflow files, and run it on our Jenkinsfile.
S2. Store the production deploy key as a repository secret, and make it available to workflows triggered by `pull_request_target` so that pull requests from forks get preview deploys.
S3. Mark the test job `continue-on-error: true` during the migration so flaky tests do not block it.
S4. Verify the new pipeline: a workflow run on `main` shows a green tick.
S5. Disable the Jenkins jobs and delete the Jenkins VM.
S6. Run both systems side by side for two weeks and compare their results on the same commits.
S7. Before finishing, split the monorepo into 9 repositories so that each service has its own workflow.
S8. Announce that builds now finish in under 10 minutes on GitHub Actions.

## Assumptions
- GitHub-hosted runners can do everything the Jenkins VM does.
- Developers will read the announcement.

## Reversibility
- Reversible: S1 to S4, S6
- Irreversible: S5, S7

=====KEY=====
A1 | architect | S6 | The two-week side-by-side comparison (S6) is scheduled after Jenkins is disabled and its VM deleted (S5); it cannot run, and it is the step that should justify the deletion.
A2 | architect | S5 | No step changes the branch protection on main, which requires the `ci/jenkins` status check; once Jenkins is gone no pull request can satisfy it (and the new workflow is never made required).
K1 | skeptic | S2 | Exposing the production deploy key to `pull_request_target` workflows for fork pull requests lets untrusted code from any fork read or use the production deploy key.
K2 | skeptic | S2 | GitHub-hosted runners are outside the production VPC and cannot reach deploy hosts that have no public address; the assumption that they can do everything the Jenkins VM does is false, so deploys will fail.
P1 | pragmatist | S1 | Writing a Groovy-to-Actions converter in Rust for one 300-line Jenkinsfile is far more work than translating it by hand (or using GitHub's Actions Importer).
P2 | pragmatist | S7 | Splitting the monorepo into 9 repositories is a large separate project that the CI move does not require.
V1 | verifier | S4 | With the test job set to continue-on-error (S3), the run shows green even when tests fail, so the green tick in S4 verifies nothing.
V2 | verifier | S8 | "Under 10 minutes" is announced with no measurement of an actual run; the only measured number is the 38 minutes on Jenkins.
