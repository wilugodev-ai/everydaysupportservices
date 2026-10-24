# Hostinger domain connection

Domain: `everydaysupportservices.com`. Google Cloud project: `everyday-care-20261023`. Service: `everyday-web`, region `us-central1`.

Google ownership verification passed on October 23, 2026. Root and www mappings were created through the regional Cloud Run API. Google returned the records below. Hostinger changes are saved. Authoritative DNS, Cloudflare, and Google resolvers now return only the four Google A records; the old Hostinger address is gone. HTTPS certificates remain CertificatePending for root and www; the Google website URL remains available.

In Hostinger's DNS / Nameservers section, replace the existing root website A/AAAA records and the www CNAME with:

| Type | Name | Value | TTL |
| --- | --- | --- | --- |
| A | @ | 216.239.32.21 | 300 |
| A | @ | 216.239.34.21 | 300 |
| A | @ | 216.239.36.21 | 300 |
| A | @ | 216.239.38.21 | 300 |
| AAAA | @ | 2001:4860:4802:32::15 | 300 |
| AAAA | @ | 2001:4860:4802:34::15 | 300 |
| AAAA | @ | 2001:4860:4802:36::15 | 300 |
| AAAA | @ | 2001:4860:4802:38::15 | 300 |
| CNAME | www | ghs.googlehosted.com | 300 |

The prior website values observed were A `212.85.28.155`, AAAA `2a02:4780:1:549:0:358e:7453:4`, and www CNAME `everydaysupportservices.com`. Public DNS before cutover is saved privately in `.data/cloud-run/domain-dns-before.json`.

Keep Google verification TXT, mail-related MX/TXT/DKIM, CAA, and other unrelated records. Keep Hostinger's `nova.dns-parking.com` and `cosmos.dns-parking.com` nameservers. Do not reset the entire DNS zone.

The application accepts the www/root custom-domain origins and the two Google website URLs for browser writes. Check the deployed API configuration before completing cutover. Accounts and records remain in PostgreSQL regardless of which hostname visitors use.

After DNS changes, check authoritative A/AAAA/CNAME responses, Google's certificate status, trusted HTTPS on root and www, homepage/sign-in/recovery HTTP status, and authenticated account/admin behavior. Direct Cloud Run domain mappings follow Ablest's existing approach; Google currently labels this feature Preview and documents latency limitations. See [Google's domain-mapping documentation](https://docs.cloud.google.com/run/docs/mapping-custom-domains).

Latest check: Google reports www CertificateProvisioned=True and Ready=True. Trusted HTTPS against an updated Google frontend returned HTTP 200 for the homepage, login, and PostgreSQL health endpoint. Other Google frontend addresses still reset TLS connections, so access remains inconsistent during propagation. The root-domain certificate remains pending. No further DNS edits are indicated.
