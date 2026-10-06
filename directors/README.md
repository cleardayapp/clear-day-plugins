# Clear Day for Directors

Skills that help a childcare director work through enrollment inquiries, tours and the school website with the assistant. Every call to the Clear Day connector requires signing in with a Clear Day director or teacher account.

## What it sends and fetches

- **One connection.** The plugin connects to a single remote server, `https://mcp.useclearday.com/mcp`. It makes no other network requests.
- **Data categories.** After you sign in with your Clear Day director or teacher account, the tools on that server return your own school's enrollment inquiries, tour schedule and website drafts. Your questions and the tool results are shared with that server only to answer your request.
- **Storage.** The plugin itself stores nothing. It has no accounts, settings or local files of its own; anything kept is kept by Clear Day under your school's account.
- **Writes.** The assistant confirms with you before any change and only sends what you explicitly approved. Booking a tour through Clear Day emails the family a confirmation, so the assistant says so and waits for your yes first. Website changes are saved as drafts for you to review; only you can publish, in Clear Day.
