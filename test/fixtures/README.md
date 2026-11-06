# Test fixtures

Recorded feed responses are sanitized examples for offline tests.

`check-test-key.pem` and `check-test-cert.pem` are deliberately public, disposable test credentials for the reserved hostname `feed.example`. They are used only by the local TLS regression test. Never use or trust this key/certificate in a deployment. The Docker image does not copy the test directory.

The certificate expires in November 2036. Regenerate this pair together when needed, keeping a `feed.example` Subject Alternative Name. The regression test explicitly verifies that a wrong hostname fails even when an insecure TLS environment variable is present.
