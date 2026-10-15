# Security

## Reporting a vulnerability

Please report vulnerabilities privately through GitHub: **Security → Report a vulnerability** on https://github.com/keystonehosting/artifact/security/advisories/new. Don't open a public issue.

Include the browser and Artifact version, the site involved, and steps to reproduce. Never include real chat contents, cookies or API keys. You'll get an acknowledgement within 7 days.

## Scope

Of particular interest:
- anything that lets a web page or chat content run code in the extension, or make it act without the user's request;
- data leaving the browser to any destination not listed in `PRIVACY.md`;
- API keys or tokens being logged, exported or exposed.

## Design rules

No remote code. Strict extension CSP. All rendered chat HTML is sanitized with DOMPurify. Artifacts are previewed only in sandboxed iframes. API keys live in `chrome.storage.local` and are never logged.
