# Contributing

Studio is two projects. The CAD tools (modeling, drawings, simulation, the skills and the viewer) are
[text-to-cad](https://github.com/earthtojake/text-to-cad). The app around them is this repository.

## Where a change goes

A new CAD capability goes in this order:

1. Contribute it to text-to-cad, following
   [its guide](https://github.com/earthtojake/text-to-cad/blob/main/CONTRIBUTING.md). Ask on its
   [Discord](https://discord.gg/5FGB9DwJYU) if you're unsure.
2. Once it is in a text-to-cad release, Studio's next update brings it.
3. Then add what Studio needs to show it, such as a Toolbox job or a panel, in a pull request here.

A change that is only about the app, such as its windows, words or Settings, starts here.

## Developer setup

See the [development runbook](docs/operations/development.md#first-checkout) for the first checkout,
development commands, tests and desktop packaging on each platform. [STUDIO.md](STUDIO.md) says how
Studio is built and run.

Studio is a fork of [T3 Code](https://github.com/pingdotgg/t3code). `main` is the only long-lived
branch: branch from it and open pull requests back to it.

## Before you start

Report bugs and propose features in [issues](https://github.com/amywork777/studio/issues), and search
the existing ones first.

- A small fix for an obvious bug can go straight to a pull request. Say what was wrong.
- A new feature, or a change to how Studio behaves, needs an issue and a maintainer's yes before you
  build it. Link that yes in your pull request.

Focused fixes are the most likely to be merged. Opening a pull request doesn't oblige us to merge it:
we may close it, ask for a smaller one, or build the idea another way.

Every change keeps [Studio's laws](AGENTS.md#studios-laws).

<a id="one-problem"></a>

## One problem per pull request

A pull request that solves two independent problems gets split, even when both fixes are useful.
Include the contract, server, client, test and documentation changes that one problem needs. An
adjacent cleanup or second fix gets its own pull request.

Follow the [documentation rules](AGENTS.md#documentation). Update user guides when how to use a
feature changes.

<a id="verification"></a>

## Show that it works

Say how you found the problem, how you checked the change and what you saw. A checkbox or "tests
pass" doesn't show that the change works.

- Run focused tests for what you changed. Don't run repo-wide checks: CI runs the full suite.
- UI changes need before and after screenshots, plus a short recording when motion or timing matters.
  Attach them to the pull request and don't commit them.
- Studio ships for Mac and Windows. Say which you tested, and what you could not check.
