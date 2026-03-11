# IG Auto Growth OS - Data Schema v2

## 1) Entity: products
- `id` string (PK)
- `name` string
- `price` number
- `size` string
- `material` string
- `selling_points` string
- `scene` string
- `link` string
- `status` enum: active | paused | archived

## 2) Entity: posts
- `id` string (PK)
- `date` string (MM/DD)
- `week` enum: W1..W4
- `type` enum: reels | feed | story
- `status` enum: 草稿 | 待拍 | 待上架 | 已發佈
- `title` string
- `script_summary` string
- `cta` string
- `product_link` string
- `trigger_tags` string[]  // pain, proof, value, urgency, reassurance
- `content_agent_version` string

## 3) Entity: post_assets
- `id` string (PK)
- `post_id` string (FK -> posts.id)
- `asset_type` enum: cover | image | video
- `prompt_block_index` number
- `nano_prompt` string
- `asset_url` string

## 4) Entity: experiments
- `id` string (PK)
- `post_id` string (FK -> posts.id)
- `hypothesis` string
- `variant_a` json  // hook, cover_title, cta
- `variant_b` json
- `winner` enum: A | B | pending
- `decision_reason` string

## 5) Entity: post_metrics_daily
- `id` string (PK)
- `post_id` string (FK -> posts.id)
- `date` string (YYYY-MM-DD)
- `reach` number
- `impressions` number
- `saves` number
- `shares` number
- `likes` number
- `comments` number
- `profile_visits` number
- `link_clicks` number
- `dms` number
- `orders` number

## 6) Entity: dm_threads
- `id` string (PK)
- `user_hash` string
- `source_post_id` string (FK -> posts.id)
- `intent` enum: price | size | material | shipping | style | other
- `stage` enum: new | qualified | offer_sent | closed
- `recommended_products` string[]
- `dm_agent_script` string
- `last_action_at` string

## 7) Derived Metrics (computed)
- `save_rate = saves / reach`
- `dm_rate = dms / reach`
- `click_rate = link_clicks / reach`
- `order_rate = orders / link_clicks`
- `dm_close_rate = closed_threads / qualified_threads`

## 8) Minimal Local Storage Shape
```json
{
  "products": [],
  "posts": [],
  "post_assets": [],
  "experiments": [],
  "post_metrics_daily": [],
  "dm_threads": []
}
```
