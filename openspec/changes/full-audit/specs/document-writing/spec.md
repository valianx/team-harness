## ADDED Requirements

### Requirement: Artifact delivery preserves requested grouping and verifies access
Document work SHALL establish principal outputs, annex treatment, format, destination and requested access from context before delivery. External delivery SHALL use the format/provider owner, verify capabilities separately for create, convert, move, share file and share folder, and read back content, URL, format/MIME, actual location and effective requested permissions. Unsupported actions SHALL remain specifically pending; a successful upload or file share SHALL NOT imply a shared folder. Working lens reports SHALL NOT automatically become separately published documents.

#### Scenario: Conversion preserves content but sharing is unavailable
- **WHEN** a consolidated report is converted and uploaded successfully while the requested folder-sharing action is unsupported
- **THEN** the delivered content and destination are verified and folder access remains explicitly pending without multiplying the principal documents
