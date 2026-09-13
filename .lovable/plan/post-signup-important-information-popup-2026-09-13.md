# Post-signup Important Information Popup

## What will be built
- Add a Bengali popup containing the supplied 12-point ordering FAQ and important information.
- Show it immediately after every successful new account registration, including email and phone registration flows.
- Make the long content scrollable and mobile-friendly, with a clear acknowledgement button.
- Show it only once for that signup in the current browser; closing it clears the pending notice.

## Technical details
- Create a focused signup-notice component using the existing dialog and button styles.
- Set a pending notice marker only after successful account creation, then let the app-level notice open across navigation.
- Support registrations that require later email confirmation by showing the notice before a logged-in session exists.
- Keep login behavior unchanged and do not show the notice to existing customers when they sign in.

## Verification
- Check both registration success paths trigger the notice.
- Confirm dismissal removes the marker and normal login does not reopen it.
- Verify the popup fits desktop and mobile screens and the project builds successfully.
