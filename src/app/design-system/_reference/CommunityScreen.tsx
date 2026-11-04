'use client';

// The design board's Community artboard (product spec section 13): photo posts with no captions
// and no comments, one reaction per person, and a paid host announcement, clearly labelled.
// Reactions are not final (Fire, Wow, Like, Love); they stay neutral, since color carries
// category and status only.
import { useState } from 'react';
import {
  Avatar,
  Button,
  IconButton,
  Img,
  OrgLogo,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TopBar,
} from '@/ui/components';
import { cn } from '@/ui/cn';
import {
  ArrowLeft,
  ChevronRight,
  Ellipsis,
  Flame,
  Heart,
  Plus,
  Sparkles,
  ThumbsUp,
  type IconComponent,
} from '@/ui/icons';
import { img, kettleRidge } from '../_gallery/samples';
import { SeekerBottomNav, SeekerTopBar } from './shells';

const reactions = [
  { id: 'fire', label: 'Fire', icon: Flame },
  { id: 'wow', label: 'Wow', icon: Sparkles },
  { id: 'like', label: 'Like', icon: ThumbsUp },
  { id: 'love', label: 'Love', icon: Heart },
] as const satisfies readonly { id: string; label: string; icon: IconComponent }[];

type ReactionId = (typeof reactions)[number]['id'];

function ReactionBar({
  count,
  top,
  pickerOpen = false,
}: {
  count: number;
  top: readonly ReactionId[];
  pickerOpen?: boolean;
}) {
  const [open, setOpen] = useState(pickerOpen);
  const [mine, setMine] = useState<ReactionId | null>(null);
  const total = count + (mine ? 1 : 0);
  const shown = mine && !top.includes(mine) ? [...top, mine] : top;
  const MineIcon = reactions.find((r) => r.id === mine)?.icon ?? ThumbsUp;

  return (
    <div className="relative flex items-center justify-between gap-2 py-2 pr-2 pl-3.5">
      <p className="flex items-center gap-2 text-14 font-semibold text-ink-2">
        <span className="flex" aria-hidden="true">
          {shown.map((id, i) => {
            const Icon = reactions.find((r) => r.id === id)?.icon ?? ThumbsUp;
            return (
              <span
                key={id}
                className={cn(
                  'flex size-6 items-center justify-center rounded-full border-2 border-surface bg-primary text-on-primary',
                  i > 0 && '-ml-2',
                )}
              >
                <Icon className="size-3.5" />
              </span>
            );
          })}
        </span>
        {total}
        <span className="sr-only"> reactions</span>
      </p>
      <Button
        variant="secondary"
        icon={MineIcon}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {mine ? reactions.find((r) => r.id === mine)?.label : 'React'}
      </Button>
      {open ? (
        <div
          role="group"
          aria-label="Pick a reaction"
          className="absolute right-2 bottom-full z-10 flex gap-1 rounded-full bg-surface p-1.5 shadow-overlay"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
        >
          {reactions.map((r) => (
            <IconButton
              key={r.id}
              icon={r.icon}
              label={r.label}
              variant={mine === r.id ? 'primary' : 'subtle'}
              aria-pressed={mine === r.id}
              onClick={() => {
                setMine((m) => (m === r.id ? null : r.id));
                setOpen(false);
              }}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function PhotoPost({
  author,
  avatarSrc,
  when,
  photo,
  reactionCount,
  topReactions,
  pickerOpen,
}: {
  author: string;
  avatarSrc?: string;
  when: string;
  photo: { src: string; alt: string };
  reactionCount: number;
  topReactions: readonly ReactionId[];
  pickerOpen?: boolean;
}) {
  return (
    <article aria-label={`Photo by ${author}`} className="rounded-xl bg-surface shadow-card">
      <header className="flex items-center gap-2.5 py-2 pr-1 pl-3.5">
        <Avatar name={author} src={avatarSrc} size="md" decorative />
        <div className="min-w-0 flex-1">
          <p className="text-15 font-bold text-ink">{author}</p>
          <p className="text-12 text-muted">{when}</p>
        </div>
        <IconButton icon={Ellipsis} label={`More: report or block ${author}`} />
      </header>
      <Img src={photo.src} alt={photo.alt} className="h-75 w-full object-cover md:h-96" />
      <ReactionBar count={reactionCount} top={topReactions} pickerOpen={pickerOpen} />
    </article>
  );
}

function Announcement() {
  return (
    <article
      aria-label="Announcement from Kettle Ridge Lodge"
      className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-4"
    >
      <p className="text-12 leading-none font-extrabold tracking-wider text-ink-2 uppercase">
        Announcement
      </p>
      <div className="flex items-center gap-2.5">
        <OrgLogo name={kettleRidge.name} src={kettleRidge.logoSrc} size="md" decorative />
        <div>
          <p className="text-15 font-bold text-ink">{kettleRidge.name}</p>
          <p className="text-12 text-muted">Seward, AK</p>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <h2 className="text-17 font-extrabold text-ink">Hiring 12 more summer staff for 2027</h2>
        <p className="text-14 text-ink-2">
          Housekeeping, kitchen and boat crew. Housing provided for every role.
        </p>
      </div>
      <Button asChild variant="secondary" fullWidth>
        <a href="#kettle-ridge-jobs">
          See open jobs
          <ChevronRight className="size-4" />
        </a>
      </Button>
    </article>
  );
}

export function CommunityScreen() {
  return (
    <div className="flex min-h-dvh flex-col bg-bg">
      <SeekerTopBar current="community" className="hidden md:block" />
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col pb-8">
        <TopBar
          className="pl-1 md:pl-4"
          start={<IconButton icon={ArrowLeft} label="Back" className="md:hidden" />}
          brand={<h1 className="text-21 font-extrabold text-ink">Community</h1>}
          actions={
            <Button variant="secondary" icon={Plus}>
              Post a photo
            </Button>
          }
        />
        <Tabs defaultValue="feed" className="px-4">
          <TabsList aria-label="Community sections">
            <TabsTrigger value="feed">Feed</TabsTrigger>
            <TabsTrigger value="photos">Photos</TabsTrigger>
            <TabsTrigger value="announcements">Announcements</TabsTrigger>
          </TabsList>
          <TabsContent value="feed" className="flex flex-col gap-4">
            <PhotoPost
              author="Jordan Kim"
              when="2 hours ago"
              photo={{
                src: img.lake,
                alt: 'Snow-capped peaks reflected in a calm lake at golden hour, pine trees on the shore',
              }}
              reactionCount={48}
              topReactions={['fire', 'love']}
              pickerOpen
            />
            <Announcement />
            <PhotoPost
              author="Ana Lopez"
              when="Yesterday"
              photo={{ src: img.harbor, alt: 'A small boat moored in a harbor at dusk' }}
              reactionCount={21}
              topReactions={['like']}
            />
          </TabsContent>
          <TabsContent value="photos">
            <ul className="grid grid-cols-3 gap-1.5">
              {[img.lake, img.harbor, img.cabin, img.farm, img.kitchen, img.bedroom].map((src) => (
                <li key={src}>
                  <Img src={src} alt="" className="aspect-square w-full rounded-md object-cover" />
                </li>
              ))}
            </ul>
          </TabsContent>
          <TabsContent value="announcements">
            <Announcement />
          </TabsContent>
        </Tabs>
      </main>
      <SeekerBottomNav current={null} />
    </div>
  );
}
