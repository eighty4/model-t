# Changelog

## [Unreleased]

### Added

- Package export for web environment used by clients when
  module resolution does not resolve as Bun or Node
- API rate limiting reset time included with error message
- TypeScript sources are added to published package for the
  Bun runtime's native TypeScript support

### Fixed

- TypeScript type declarations were broken by pointing to a
  directory instead of the export entrypoint `.d.ts` file

## [v0.0.4] - 2025-06-24

### Added

- Workflows are strictly validated for any unknown/unsupported keys

## [v0.0.3] - 2025-06-16

### Added

- Actions used by workflows are fetched to validate calling workflow
  provides values for required action inputs
- Workflows are fetched from external repositories to validate calling
  workflow provides values for required called workflow inputs

## [v0.0.2] - 2025-06-04

### Added

- cicd workflows

### Fixed

- exec permission missing on bin script

## [v0.0.1] - 2025-06-04

### Added

- validate schema of GitHub workflows

[Unreleased]: https://github.com/eighty4/model-t/compare/v0.0.4...HEAD
[v0.0.4]: https://github.com/eighty4/model-t/compare/v0.0.3...v0.0.4
[v0.0.3]: https://github.com/eighty4/model-t/compare/v0.0.2...v0.0.3
[v0.0.2]: https://github.com/eighty4/model-t/compare/v0.0.1...v0.0.2
[v0.0.1]: https://github.com/eighty4/model-t/releases/tag/v0.0.1
