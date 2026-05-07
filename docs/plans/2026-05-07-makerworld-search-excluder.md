# MakerWorld Search Excluder

## Goal

Add a Tampermonkey script for MakerWorld search pages that lets the user exclude results by one or more title keywords because MakerWorld search does not support boolean exclusion.

## Behavior

- Adds an `Exclude` button beside the existing search bar.
- Accepts one or more keywords from a prompt using commas or new lines.
- Treats new prompt submissions additively instead of replacing the current list.
- Adds a `Clear` button to remove all excluded keywords at once.
- Renders the active exclusions as removable chips beside the search bar.
- Hides search result cards when the result title contains any excluded keyword.
- Matches titles only, case-insensitively.

## State model

- Exclusions do not persist in Tampermonkey storage.
- Exclusions are mirrored into the current search URL through `tmExclude`.
- The script rehydrates exclusions from `tmExclude` on page load.
- Pagination links are rewritten so `tmExclude` survives next/previous page navigation.

## Constraints

- A fresh search URL without `tmExclude` starts with an empty exclusion list.
- The script should tolerate MakerWorld hydration and infinite-scroll style DOM updates by reapplying filtering when the result list changes.
