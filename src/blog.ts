import type { CollectionEntry } from "astro:content";

/** A post that belongs to a series but is not that series' overview page. */
export function isSeriesPart(post: CollectionEntry<"blog">): boolean {
	return !!post.data.series && !post.data.seriesOverview;
}

/**
 * The date a post is presented and sorted by. For a series overview this is the
 * most recent `pubDate` anywhere in the series (including the overview's own),
 * so the series home resurfaces whenever a new installment is published. For
 * every other post it is the post's own `pubDate`.
 */
export function effectiveDate(
	post: CollectionEntry<"blog">,
	allPosts: CollectionEntry<"blog">[],
): Date {
	if (!post.data.seriesOverview) return post.data.pubDate;
	const seriesDates = allPosts
		.filter((p) => p.data.series === post.data.series)
		.map((p) => p.data.pubDate.valueOf());
	return new Date(Math.max(...seriesDates));
}
