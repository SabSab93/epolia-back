---
name: test-writer
description: Add focused tests for Epolia backend changes. Use when a service, controller, DTO, or bug fix needs practical coverage.
---

# Test Writer

Use this skill to write tests that protect behavior without making the suite brittle.

## Rules

- Test observable behavior.
- Keep unit tests close to service logic.
- Use e2e tests for important HTTP flows only.
- Avoid testing framework internals or implementation details.
- Keep mocks small and explicit.
- Add regression tests for fixed bugs.

## Checklist

For each test, name the behavior, arrange only necessary data, assert meaningful output or exception, then run the smallest relevant test command before the full suite.
