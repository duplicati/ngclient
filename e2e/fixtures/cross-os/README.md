# Cross-OS synthetic backup fixtures

These small unencrypted repositories were created on actual Linux and Windows servers during the isolated #449 recheck on 2026-11-13. They contain only synthetic `Documents/payload.txt` and `peer.txt` files, never user data. Linux payload: `linux payload\n`; Windows payload: `windows payload\n`. The original Windows paths refer to the disposable ngclient verification workspace, not a user's backup.

Producer evidence: the ngclient triage record for NGT-045 / #449 and local `tmp/restore449-recheck-20261114/linux-to-windows-api.json` / `windows-to-linux-api.json`. The producer was a post-#7776 Duplicati Debug build; exact clean producer-source correspondence is not claimed. Fixtures represent real foreign-OS archive paths, not fabricated list responses.

The live cross-OS test copies the opposite OS repository into the worker's disposable directory. It lists and restores through the actual server/API/UI. On Windows it tests Linux → Windows; on Linux it tests Windows → Linux. Run both host OSes to cover both directions. The read-only checked-in fixtures are never passed directly as a writable backend.
