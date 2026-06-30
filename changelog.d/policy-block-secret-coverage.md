### Fixed
- `hooks/policy-block.sh`: broadened secret scan from `git commit` only to also cover `curl --data`, `wget --post-data`, `tee`, `export VAR=`, and `env VAR=` shell commands in both the Python path and the bash degraded path.
- `hooks/policy-block.sh`: added Anthropic API key (`sk-ant-…`) as a high-confidence deny pattern with its own label, ensuring it fires before the generic `sk-…` catch-all.
- `hooks/policy-block.sh`: added SendGrid (`SG.…`), Twilio account SID (`AC…`), and Twilio API key SID (`SK…`) as high-confidence deny patterns.
- `hooks/policy-block.sh`: added JWT (`eyJ…` three-segment base64url), Bearer token keyword form, and Azure SAS (`sv=…`) as medium-confidence ask patterns (Python path; bash degraded command scan covers JWT, Bearer, and Azure SAS).
- `tests/test_policy_block.sh`: added test fixtures for all new patterns (deny: sk-ant/SendGrid/Twilio/broadened-bash; ask: JWT/Bearer/Azure SAS/broadened-bash; allow: benign curl/export/tee).
- `hooks/policy-block.sh`: propagated new HIGH patterns (sk-ant, SendGrid, Twilio AC/SK) and MEDIUM patterns (JWT, Bearer, Azure SAS) to the bash degraded path's Write/Edit content scan, closing the asymmetry with the Python path on hosts without python3 (SEC-A-02).
- `tests/test_policy_block.sh`: added degraded-path Write/Edit test case verifying the new patterns fire when python3 is absent.
