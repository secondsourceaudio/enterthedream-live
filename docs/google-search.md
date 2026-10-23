# Google Search for Second Source

The site now identifies itself as **Second Source**, an independent record label
based in Oslo, Norway. Public pages have descriptive titles, descriptions,
canonical HTTPS URLs and social metadata. The homepage includes `WebSite` and
`Organization` JSON-LD with the real logo, location, email and Bandcamp profile.
`robots.txt` advertises the sitemap of public pages. Google does not use a
`keywords` meta tag for indexing or ranking.

The homepage description is: “Second Source is an independent record label based
in Oslo, Norway. Find our releases alongside images, audiovisual work and other
things to explore.” The same wording is used in its social descriptions and
`WebSite` structured data. Its player
dock, information dialog contents and legal footer contents use `data-nosnippet`
on `div` elements so controls, instructions and copyright notices are excluded
from Google's text snippets. This leaves the page indexable and its interface
unchanged. Google still chooses the final snippet and must recrawl the page to
pick up these settings.

## Replace the old LiteSpeed listing

1. Open [Google Search Console](https://search.google.com/search-console/welcome)
   using the Google account that should manage the label's search presence.
2. Add the **URL prefix** `https://www.enterthedream.org/`.
3. Choose **HTML file** verification. The owner's supplied file
   `googlec09c60a1ba012786.html` is published unchanged at
   `https://www.enterthedream.org/googlec09c60a1ba012786.html`. Select **Verify**
   in Search Console. Keep the file published after verification so Google can
   continue checking ownership. For a different property or owner, use the exact
   file Google supplies; never invent a verification token.
4. Inspect `https://www.enterthedream.org/` with **URL Inspection**. Use **Test
   Live URL** to confirm Google receives the current Second Source page. If it
   still receives a LiteSpeed directory listing, resolve the hosting or domain
   routing before requesting indexing. The GitHub Pages setting **Enforce HTTPS**
   should redirect the HTTP version to the HTTPS page.
5. Select **Request indexing** for the homepage, and submit `sitemap.xml` under
   **Sitemaps**. Repeat URL inspection for RELEASES, MERCH and ABOUT / CONTACT if
   their search previews also need refreshing.

Search Console verification and indexing requests require the owner's account.
Google decides when to recrawl and what title, snippet and site name to display;
these changes do not guarantee a particular search position. Crawling may take
days to weeks.

## References

- [Site names](https://developers.google.com/search/docs/appearance/site-names)
- [Titles in search results](https://developers.google.com/search/docs/appearance/title-link)
- [Search snippets and descriptions](https://developers.google.com/search/docs/appearance/snippet)
- [Exclude specific text with data-nosnippet](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag#data-nosnippet-attr)
- [Supported meta tags](https://developers.google.com/search/docs/crawling-indexing/special-tags)
- [Request a recrawl](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
