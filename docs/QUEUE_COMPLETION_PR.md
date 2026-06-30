# Queue completion PR note

This branch adds a small internal workflow update:

- Complete an open queue item.
- Store result, note, reviewer ID, and resolved timestamp.
- Allow the protected web proxy to call the completion endpoint.
- Add a web client helper for completion.
- Document the queue completion API.

The endpoint only updates queue metadata. It does not directly change listings or accounts.
