# Security Policy

Obsidian Image Clipper handles browser cookies locally. Please report security issues privately before opening a public issue.

## Supported Versions

This project is pre-1.0. Security fixes are expected on the latest released version only.

## Reporting A Vulnerability

Use GitHub Security Advisories if they are enabled for the repository. If not, contact the maintainers privately before publishing details.

Please include:

- A short description of the issue and impact.
- Reproduction steps using sanitized domains such as `kb.example.com`.
- Affected component: browser extension, native host, Obsidian plugin, or shared validation.
- Whether cookie values, auth headers, or local auth files could be exposed.

Do not include real cookies, private URLs, auth file contents, or screenshots that expose secrets.

## Security Boundaries

- Protected domains are exact hosts only.
- Wildcards, paths, ports, and protocols are rejected in domain configuration.
- Cookie values are written only to the local auth file, outside the Obsidian vault by default.
- The native host writes private config files with owner-only permissions.
- The Obsidian plugin injects auth headers only for exact configured hosts.
