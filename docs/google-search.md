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
`WebSite` structured data. Its player dock, information dialog contents and legal
footer contents use `data-nosnippet`
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

## Searches for Second Source Audio

The homepage and ABOUT / CONTACT titles use **Second Source Audio** to associate
that full name with this domain. The visible label name remains **Second Source**;
the homepage's `Organization` and `WebSite` structured data already include
**Second Source Audio** as an alternate name. Keep the approved homepage
description consistent across metadata rather than adding repeated keywords.

On the label's Bandcamp and official social profiles, add a website link to
`https://www.enterthedream.org/` if it is missing. Use the actual label name
consistently on those profiles. Links from genuine artist, distributor and release
pages can also help people and search engines discover the site. These external
edits need access to those accounts; they are not part of this repository.

After publication, request indexing for the homepage and ABOUT / CONTACT, then
use Search Console's Performance report to monitor the query “Second Source
Audio” once data is available. Being indexed does not guarantee visibility near
the top of results. Do not promise an immediate ranking change or repeatedly
submit the same unchanged URL.

## References

- [Site names](https://developers.google.com/search/docs/appearance/site-names)
- [Titles in search results](https://developers.google.com/search/docs/appearance/title-link)
- [Search snippets and descriptions](https://developers.google.com/search/docs/appearance/snippet)
- [Exclude specific text with data-nosnippet](https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag#data-nosnippet-attr)
- [Supported meta tags](https://developers.google.com/search/docs/crawling-indexing/special-tags)
- [Request a recrawl](https://developers.google.com/search/docs/crawling-indexing/ask-google-to-recrawl)
