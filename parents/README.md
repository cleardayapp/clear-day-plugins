# Clear Day for Parents

Skills that help a family find and compare licensed daycare with the assistant, using public records. This plugin is for adults (parents and guardians) looking for child care. It is not for children.

## What it sends and fetches

- **One connection.** The plugin connects to a single remote server, `https://mcp.useclearday.com/mcp/find`. It makes no other network requests.
- **Data categories.** Most tools on that server return public licensing and inspection records for childcare providers. They need only a location or a provider name and an age group. The one exception is the tour request, described under Writes. Do not share a child's name, birth date, photo or health details.
- **Storage.** The plugin itself stores nothing. It has no accounts, settings or local files of its own.
- **Writes.** The search and comparison tools are read-only. One tool, `request_child_care_tour`, is not: it takes the parent's first name, last name and email address, and Clear Day then emails the parent a confirmation link. Nothing reaches the childcare provider until the parent confirms through that link. The guardrails require the assistant to tell you what will be sent and to wait for your explicit yes before calling it. Nothing else in this plugin sends anything.
