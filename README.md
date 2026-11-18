# GTA VI launch map

A live world map of where GTA VI has unlocked, country by country. Unofficial fan page.

**Live:** https://ksvslk.github.io/gta6-launch-map/

## How it works

- Rockstar says the game releases at midnight local time on 19 November 2026 in every region, on PS5 and Xbox Series X|S.
- PlayStation Store pages list an exact unlock time for 63 countries and regions, in 15 waves. New Zealand is first at 11:00 UTC on 18 November. Mexico and Central America are last at 06:00 UTC on 19 November. These countries fill in solid.
- Countries with no store listing fill in striped once midnight passes in their capital.
- The page runs on that schedule and the visitor's device clock. It does not query the stores.

## Files

| Path | What it is |
| --- | --- |
| `index.html` | The whole page. No build step and no dependencies. |
| `countries.json` | One record per country: unlock time, wave and a pre-projected outline. |
| `og.jpg` | Link-preview image (1200×630) used when the page is shared. |
| `build/` | Script that regenerates `countries.json` from Natural Earth shapes. |

## Rebuild the map data

```sh
cd build
npm install
npm run build
```

The wave table lives in two places: `WAVES` in `build/build-data.mjs` (times and country codes) and `WAVES` in `index.html` (times and names for the list). Change both if the schedule changes.

## Preview a moment in time

Add `?at=` with a UTC time to see the map as it would look then, for example `?at=2026-11-18T23:30Z`. The page labels itself as a preview while this is on.

## Credits

- Country shapes: [Natural Earth](https://www.naturalearthdata.com/) via [world-atlas](https://github.com/topojson/world-atlas).
- Time zones: IANA tz database via [countries-and-timezones](https://github.com/manuelmhtr/countries-and-timezones).
- Unlock times: [Rockstar Games support](https://support.rockstargames.com/articles/29jV3Cv2cCgvwM1XgtMO5o) and the [PlayStation Store times compiled by GTA BOOM](https://www.gtaboom.com/gta-6-release-times-when-it-unlocks-in-your-region-and-how-to-play-early-da2c).

Fan-made and unofficial. Not affiliated with Rockstar Games, Take-Two Interactive, Sony or Microsoft.
