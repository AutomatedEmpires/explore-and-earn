'use client';

// "Follow <host>" on a closed listing (Figma 178:16021). Seekers follow through
// PUT /api/v1/hosts/[slug]/follow; guests go to sign-in and come back here first.
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, ToastProvider, useToast } from '@/ui/components';
import { Check } from '@/ui/icons';

type Props = { hostName: string; hostSlug: string; seeker: boolean; signInHref: string };

function Follow({ hostName, hostSlug, seeker, signInHref }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [following, setFollowing] = useState(false);
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    if (!seeker) {
      router.push(signInHref);
      return;
    }
    setPending(true);
    try {
      const res = await fetch(`/api/v1/hosts/${encodeURIComponent(hostSlug)}/follow`, {
        method: following ? 'DELETE' : 'PUT',
      });
      if (!res.ok) throw new Error(String(res.status));
      setFollowing(!following);
    } catch {
      toast({ title: 'Couldn’t update that. Try again.', tone: 'danger' });
    } finally {
      setPending(false);
    }
  };

  return (
    <Button
      variant="secondary"
      size="lg"
      loading={pending}
      aria-pressed={seeker ? following : undefined}
      onClick={() => void onClick()}
    >
      {following ? (
        <>
          <Check className="size-5" />
          Following {hostName}
        </>
      ) : (
        `Follow ${hostName}`
      )}
    </Button>
  );
}

export function FollowButton(props: Props) {
  return (
    <ToastProvider>
      <Follow {...props} />
    </ToastProvider>
  );
}
