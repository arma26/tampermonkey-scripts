# MakerWorld Search Excluder

## Goal

Add a Tampermonkey script for MakerWorld search pages that lets the user constrain results by include and exclude title keywords because MakerWorld search does not support boolean exclusion.

## Behavior

- Adds `Include` and `Exclude` buttons beside the existing search bar.
- Accepts one or more keywords from a prompt using commas or new lines.
- Treats new prompt submissions additively instead of replacing the current list.
- Adds clear buttons to remove all include or exclude keywords at once.
- Renders the active include and exclude keywords as removable chips beside the search bar.
- Hides search result cards when the result title fails the include filter or matches the exclude filter.
- Include matching requires titles to match all include keywords.
- Matches titles only, case-insensitively, and ignores punctuation and spacing differences by comparing alphanumeric-only forms.

## State model

- Filters do not persist in Tampermonkey storage.
- Include keywords are mirrored into the current search URL through `tmInclude`.
- Exclude keywords are mirrored into the current search URL through `tmExclude`.
- The script rehydrates both lists from the URL on page load.
- Pagination links are rewritten so `tmInclude` and `tmExclude` survive next/previous page navigation.

## Constraints

- A fresh search URL without `tmExclude` starts with an empty exclusion list.
- The script should tolerate MakerWorld hydration and infinite-scroll style DOM updates by reapplying filtering when the result list changes.
