# 0001. Record architecture decisions

- Status: Accepted
- Date: 2026-10-01

## Context

This project is meant to show _why_ it is built the way it is, not only _what_ it does.
Decisions made in chat or in commit messages get lost.

## Decision

Keep lightweight ADRs in `docs/adr`, numbered, one decision per file, using three sections:
context, decision, consequences. A changed decision gets a new ADR that supersedes the old one.

## Consequences

- Reviewers can follow the reasoning behind the structure without reading the whole history.
- Writing an ADR is part of the change that introduces the decision, in the same pull request.
