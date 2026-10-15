# Google Cloud Icons

Source: https://cloud.google.com/static/icons/files/google-cloud-icons.zip
(retrieved 2026-08-25; archive `last-modified` 2021-10-15).

Only the `.svg` files were vendored, preserving the archive's `<service>/<service>.svg`
layout. The accompanying `.png` files were not copied.

The manifest `public/gcp-icons.json` is generated from this directory.

Note: the ten flat `.svg` files in the parent `public/gcp-icons/` directory are a separate,
older hand-made set consumed by the costs feature
(`src/features/services/components/costs/constants/provider-icon-map.ts`). They are not part
of this set and are not listed in the manifest.
