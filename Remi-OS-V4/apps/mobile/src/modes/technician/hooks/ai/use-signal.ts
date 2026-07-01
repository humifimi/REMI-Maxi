import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
} from "@tanstack/react-query";
import { signalApi } from "@technician/api/client";
import { Endpoints } from "@technician/api/endpoints";
import {
  HelpRequestCategory,
  HelpRequestStatus,
  SignalPostType,
  type SignalPost,
  type SignalPostAuthor,
  type SignalComment,
  type SignalFeedResponse,
  type SignalFeedParams,
  type CreatePostRequest,
  type CreateCommentRequest,
} from "@technician/types/signal";

const FEED_PAGE_SIZE = 20;

// PLAN-DEVIATION: 2026-04-25-signal-be-shape-bridge — BE returns flat
// snake_case rows; FE consumes a richer camelCase envelope. We bridge in
// this hook layer so screens and PostCard stay agnostic until the BE catches
// up. See docs/PLAN-DEVIATIONS.md#2026-04-25-signal-be-shape-bridge.
interface BackendPostRow {
  id: number;
  author_id: number;
  post_type: string | null;
  body: string | null;
  tags: string[] | null;
  comment_count: number | null;
  reaction_count: number | null;
  help_status: string | null;
  created_at: string;
  updated_at: string;
  // Joined from `users` for /feed only — absent on /posts/:id (which calls
  // getPostById without joins). Default to "Unknown" when missing so the UI
  // doesn't crash on a NULL author dereference.
  author_name?: string | null;
  author_avatar?: string | null;
  author_role?: string | null;
}

interface BackendCommentRow {
  id: number;
  post_id: number;
  author_id: number;
  body: string;
  created_at: string;
  // Joined from `users` for /posts/:id/comments. No `role` in the join.
  author_name?: string | null;
  author_avatar?: string | null;
}

function mapBackendAuthor(row: {
  author_id: number;
  author_name?: string | null;
  author_avatar?: string | null;
  author_role?: string | null;
}): SignalPostAuthor {
  return {
    id: row.author_id,
    name: row.author_name ?? "Unknown",
    avatar_url: row.author_avatar ?? null,
    role: row.author_role ?? "",
  };
}

function isSignalPostType(value: string | null | undefined): value is SignalPostType {
  return (
    value === SignalPostType.TEXT ||
    value === SignalPostType.PHOTO ||
    value === SignalPostType.VIDEO ||
    value === SignalPostType.HELP_REQUEST
  );
}

function isHelpRequestStatus(
  value: string | null | undefined
): value is HelpRequestStatus {
  return (
    value === HelpRequestStatus.OPEN ||
    value === HelpRequestStatus.IN_PROGRESS ||
    value === HelpRequestStatus.RESOLVED
  );
}

function mapBackendPost(row: BackendPostRow): SignalPost {
  const type: SignalPostType = isSignalPostType(row.post_type)
    ? row.post_type
    : SignalPostType.TEXT;

  return {
    id: row.id,
    type,
    author: mapBackendAuthor(row),
    body: row.body ?? "",
    // BE feed/detail endpoints don't currently expand signal_media URLs into
    // the post row. Treat as no media until the BE joins them in (or we add
    // a per-card media query).
    media_urls: [],
    tags: row.tags ?? [],
    like_count: row.reaction_count ?? 0,
    comment_count: row.comment_count ?? 0,
    // BE doesn't expose viewer-specific reaction state on the feed payload.
    // Default to false so the heart renders unfilled; the optimistic update
    // path in `useToggleLike` still flips it locally on tap.
    liked_by_me: false,
    help_request:
      type === SignalPostType.HELP_REQUEST && isHelpRequestStatus(row.help_status)
        ? {
            // BE flattens help_request fields onto the post row; category /
            // resolved_* are not currently surfaced, so default the category
            // to "other" and leave the resolution fields null until D2P-FE-?
            // pulls those columns into the bridge.
            category: HelpRequestCategory.OTHER,
            status: row.help_status,
            resolved_at: null,
            resolved_by: null,
          }
        : undefined,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function mapBackendComment(row: BackendCommentRow): SignalComment {
  return {
    id: row.id,
    post_id: row.post_id,
    author: mapBackendAuthor(row),
    body: row.body,
    created_at: row.created_at,
  };
}

export function useSignalFeed(params?: Omit<SignalFeedParams, "cursor">) {
  return useInfiniteQuery({
    queryKey: ["signal-feed", params?.type, params?.tag, params?.search],
    queryFn: async ({ pageParam }) => {
      const offset = pageParam ?? 0;
      // FE-facing filter names → BE query params:
      //   `type` → `post_type`
      //   `tag`  → `tags` (BE accepts comma-separated)
      //   `search` is intentionally dropped — BE has no full-text search on
      //   /feed (the dedicated /signal/search endpoint is a separate flow we
      //   haven't wired up yet). Leaving the field in the FE params signature
      //   so the screen can keep its search box without a code change once
      //   that lands.
      const query: Record<string, unknown> = {
        limit: FEED_PAGE_SIZE,
        offset,
      };
      if (params?.type) query.post_type = params.type;
      if (params?.tag) query.tags = params.tag;

      const rows = await signalApi<BackendPostRow[]>(
        "get",
        Endpoints.signal.feed,
        query
      );
      const posts = rows.map(mapBackendPost);
      // Synthesize the envelope the FE expects: pagination metadata is
      // derived from the page size (BE returns no cursor or total).
      const response: SignalFeedResponse = {
        posts,
        next_cursor:
          posts.length === FEED_PAGE_SIZE ? offset + FEED_PAGE_SIZE : null,
        total_count: -1,
      };
      return response;
    },
    initialPageParam: 0 as number,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useSignalPost(postId: number) {
  return useQuery({
    queryKey: ["signal-post", postId],
    queryFn: async () => {
      // BE /posts/:id returns `{ ...signal_posts row, media, comments }`
      // WITHOUT joining the author table (only the /feed query joins users).
      // Map through the same transformer; missing author fields fall back to
      // "Unknown" + null avatar — see mapBackendAuthor.
      const row = await signalApi<BackendPostRow>(
        "get",
        Endpoints.signal.post(postId)
      );
      return mapBackendPost(row);
    },
    enabled: postId > 0,
    staleTime: 30_000,
    retry: 1,
  });
}

export function useSignalComments(postId: number) {
  return useQuery({
    queryKey: ["signal-comments", postId],
    queryFn: async () => {
      const rows = await signalApi<BackendCommentRow[]>(
        "get",
        Endpoints.signal.comments(postId)
      );
      return rows.map(mapBackendComment);
    },
    enabled: postId > 0,
    staleTime: 15_000,
    retry: 1,
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreatePostRequest) => {
      // PLAN-DEVIATION: 2026-04-25-signal-be-shape-bridge — BE Zod schema
      // requires `post_type` (snake_case) and silently ignores `type`. The FE
      // CreatePostRequest type uses `type` to match the camelCase shape it
      // reads back from the feed. Translate at the wire boundary so screens
      // and types stay consistent on the FE side.
      const body: Record<string, unknown> = {
        post_type: payload.type,
        body: payload.body,
      };
      if (payload.tags && payload.tags.length > 0) body.tags = payload.tags;
      if (payload.media_urls && payload.media_urls.length > 0) {
        // BE schema doesn't accept media_urls on the create endpoint yet —
        // media is uploaded separately and joined via signal_media. Forward
        // the field anyway so it's visible in the network log if/when the
        // BE adds it; Zod will strip unknown keys today.
        body.media_urls = payload.media_urls;
      }

      const row = await signalApi<BackendPostRow>(
        "post",
        Endpoints.signal.create,
        body
      );
      return mapBackendPost(row);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["signal-feed"] });
    },
  });
}

export function useAddComment(postId: number) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (payload: CreateCommentRequest) => {
      const row = await signalApi<BackendCommentRow>(
        "post",
        Endpoints.signal.addComment(postId),
        payload
      );
      return mapBackendComment(row);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["signal-comments", postId],
      });
      queryClient.invalidateQueries({ queryKey: ["signal-feed"] });
    },
  });
}

export function useToggleLike() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      postId,
      // `liked` is the CURRENT state at the time of tap. The BE's
      // POST /signal/reactions is a single-toggle endpoint, so we don't
      // need to send a "want_liked" — sending the same reaction_type
      // twice toggles it off. We pass `liked` here purely so the
      // optimistic update in `onMutate` knows whether to flip up or down.
      liked: _liked,
    }: {
      postId: number;
      liked: boolean;
    }) => {
      // PLAN-DEVIATION: 2026-04-25-signal-be-shape-bridge — the BE exposes
      // a single POST /signal/reactions toggle endpoint with body
      // `{ post_id, reaction_type }`, NOT the per-post /like and /unlike
      // verbs the FE originally targeted. This rewire fixes the like
      // mutation that was 404ing in round-2 of the D2P-FE-1 smoke test.
      // BE returns `{ added: boolean }` — true if the reaction was just
      // added, false if it was just removed (i.e. the post-state liked
      // value). See docs/PLAN-DEVIATIONS.md#2026-04-25-signal-be-shape-bridge
      // (the entry's table row for /like and /unlike).
      const result = await signalApi<{ added: boolean }>(
        "post",
        Endpoints.signal.reactions,
        { post_id: postId, reaction_type: "like" }
      );
      return { liked: result.added };
    },
    onMutate: async ({ postId, liked }) => {
      await queryClient.cancelQueries({ queryKey: ["signal-feed"] });

      queryClient.setQueriesData<{
        pages: SignalFeedResponse[];
        pageParams: unknown[];
      }>({ queryKey: ["signal-feed"] }, (old) => {
        if (!old) return old;
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            posts: page.posts.map((p) =>
              p.id === postId
                ? {
                    ...p,
                    liked_by_me: !liked,
                    like_count: p.like_count + (liked ? -1 : 1),
                  }
                : p
            ),
          })),
        };
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["signal-feed"] });
    },
  });
}
