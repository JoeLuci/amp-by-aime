-- Create notifications table
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  message text not null,
  link text, -- URL to navigate when clicked
  type text not null, -- 'lender', 'vendor', 'resource', 'announcement', etc.
  icon text, -- Optional icon/emoji
  created_at timestamptz default now(),
  created_by uuid references auth.users(id),
  
  -- Constraints
  constraint valid_type check (type in ('lender', 'vendor', 'resource', 'announcement', 'update', 'promotion'))
);

-- Create user_notifications junction table (tracks read/unread per user)
create table if not exists public.user_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  notification_id uuid references public.notifications(id) on delete cascade not null,
  is_read boolean default false,
  read_at timestamptz,
  created_at timestamptz default now(),
  
  -- Ensure one entry per user per notification
  unique(user_id, notification_id)
);

-- Create indexes
create index if not exists idx_notifications_created_at on public.notifications(created_at desc);
create index if not exists idx_user_notifications_user_id on public.user_notifications(user_id);
create index if not exists idx_user_notifications_is_read on public.user_notifications(is_read);
create index if not exists idx_user_notifications_notification_id on public.user_notifications(notification_id);

-- Enable RLS
alter table public.notifications enable row level security;
alter table public.user_notifications enable row level security;

-- Policies for notifications (all users can read)
create policy "Anyone can view notifications"
  on public.notifications for select
  using (true);

-- Policies for user_notifications (users can only see their own)
create policy "Users can view their own notification status"
  on public.user_notifications for select
  using (auth.uid() = user_id);

create policy "Users can insert their own notification status"
  on public.user_notifications for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own notification status"
  on public.user_notifications for update
  using (auth.uid() = user_id);

-- Function to auto-create user_notification entries for all users when a new notification is created
create or replace function public.create_user_notifications_for_all()
returns trigger as $$
begin
  -- Insert a user_notification record for each existing user
  insert into public.user_notifications (user_id, notification_id)
  select id, new.id
  from auth.users
  where id in (select id from public.profiles); -- Only users with profiles
  
  return new;
end;
$$ language plpgsql security definer;

-- Trigger to auto-create user_notifications when a notification is created
create trigger on_notification_created
  after insert on public.notifications
  for each row
  execute function public.create_user_notifications_for_all();

-- Function to update read_at timestamp when is_read is set to true
create or replace function public.update_notification_read_at()
returns trigger as $$
begin
  if new.is_read = true and old.is_read = false then
    new.read_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

-- Trigger to update read_at
create trigger on_notification_read
  before update on public.user_notifications
  for each row
  execute function public.update_notification_read_at();
