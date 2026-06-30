# Atlas Smoke Test Report

Generated: 2026-06-22T15:44:35.321Z

## Summary

- Status: PASS
- Passed tests: 10
- Failed tests: 0

## Passed Tests

- Atlas smoke suite boots and exposes core navigation pages
- Atlas smoke suite keeps UI free of obvious raw/null regressions and duplicate sidebar tree names
- Atlas smoke suite rejects agent reports with missing or wrong API keys and accepts a valid report
- Atlas smoke suite read APIs require API key and return agent-facing Atlas context
- Atlas smoke suite read APIs return projects, work items, and canonical search matches
- Atlas smoke suite registers generic agents, creates runs, and accepts run callback reports
- Atlas smoke suite renders workflow reports as one coherent operator workflow
- Atlas smoke suite reportToAtlas sends the correct agent payload and API key header
- Atlas smoke suite CLI report script works in dry-run mode with config and arguments
- Atlas smoke suite reconciles agent reports into the UI alongside manual updates

## Failed Tests

- None

## Bugs Found

- None

## Files Touched

- src/App.jsx

## Commands To Rerun

```bash
npm run smoke
npm test
```

## Raw Output

```text
(no console output)
```
