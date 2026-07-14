-- Prevent a retried completion request from creating duplicate history rows.
delete from public.pilot_recommendation_history older
using public.pilot_recommendation_history newer
where older.user_id = newer.user_id
  and older.recommendation_id = newer.recommendation_id
  and (older.created_at < newer.created_at or (older.created_at = newer.created_at and older.id < newer.id));

create unique index if not exists pilot_recommendation_history_user_recommendation_uidx
  on public.pilot_recommendation_history(user_id, recommendation_id);
