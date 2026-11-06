const postsContainer = document.getElementById('posts');
const postCount = document.getElementById('postCount');
const loadError = document.getElementById('loadError');
const canonicalLink = document.querySelector('link[rel="canonical"]');
const postSlug = (post) => {
  const titleSlug = post.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${post.date}-${titleSlug}`;
};
const articleUrlFor = (post) => `/blog/articles/${postSlug(post)}.html`;

function updateMeta(post) {
  const url = new URL(articleUrlFor(post), window.location.origin);
  const imageUrl = new URL('/rocketgpt-share.png', window.location.origin).href;
  document.title = `${post.title} | RocketGPT Blog`;
  document.querySelector('meta[name="description"]').content = post.summary;
  document.querySelector('meta[property="og:type"]').content = 'article';
  document.querySelector('meta[property="og:title"]').content = document.title;
  document.querySelector('meta[property="og:description"]').content = post.summary;
  document.querySelector('meta[property="og:url"]').content = url.href;
  document.querySelector('meta[property="og:image"]').content = imageUrl;
  document.querySelector('meta[property="og:image:type"]').content = 'image/png';
  document.querySelector('meta[property="og:image:width"]').content = '1200';
  document.querySelector('meta[property="og:image:height"]').content = '630';
  document.querySelector('meta[property="og:image:alt"]').content = 'Rocket 2.0 — a free AI chat workspace for sharper ideas and shareable content.';
  document.querySelector('meta[name="twitter:title"]').content = document.title;
  document.querySelector('meta[name="twitter:description"]').content = post.summary;
  document.querySelector('meta[name="twitter:image"]').content = imageUrl;
  const getArticleMeta = (property) => {
    let meta = document.querySelector(`meta[property="${property}"]`);
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('property', property);
      document.head.append(meta);
    }
    return meta;
  };
  const publishedTime = getArticleMeta('article:published_time');
  const articleSection = getArticleMeta('article:section');
  publishedTime.content = `${post.date}T00:00:00Z`;
  articleSection.content = post.category;
  if (canonicalLink) canonicalLink.href = url.href;
}

function makePost(post, { detail = false, featured = false } = {}) {
  const article = document.createElement('article');
  article.className = `post${detail ? ' post-detail' : ''}${featured ? ' post-featured' : ''}`;

  if (detail) {
    const image = document.createElement('img');
    image.className = 'post-detail-image';
    image.src = post.image;
    image.alt = post.imageAlt;
    image.decoding = 'async';
    article.append(image);
  } else {
    const imageLink = document.createElement('a');
    imageLink.className = 'post-image-link';
    imageLink.href = articleUrlFor(post);
    imageLink.setAttribute('aria-label', `Read: ${post.title}`);
    const image = document.createElement('img');
    image.className = 'post-image';
    image.src = post.image;
    image.alt = post.imageAlt;
    image.loading = featured ? 'eager' : 'lazy';
    image.decoding = 'async';
    imageLink.append(image);
    article.append(imageLink);
  }

  const content = document.createElement('div');
  content.className = 'post-content';

  const meta = document.createElement('div');
  meta.className = 'post-meta';
  const category = document.createElement('span');
  category.className = 'post-category';
  category.textContent = post.category;
  const date = document.createElement('time');
  date.dateTime = post.date;
  date.textContent = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(new Date(`${post.date}T12:00:00Z`));
  meta.append(category, date);

  const title = document.createElement('h3');
  if (detail) {
    title.textContent = post.title;
  } else {
    const titleLink = document.createElement('a');
    titleLink.className = 'post-title-link';
    titleLink.href = articleUrlFor(post);
    titleLink.textContent = post.title;
    title.append(titleLink);
  }

  const summary = document.createElement('p');
  summary.className = 'post-summary';
  summary.textContent = post.summary;

  content.append(meta, title, summary);
  if (detail) {
    const body = document.createElement('div');
    body.className = 'post-body';
    for (const paragraphText of post.body) {
      const paragraph = document.createElement('p');
      paragraph.textContent = paragraphText;
      body.append(paragraph);
    }
    const actions = document.createElement('div');
    actions.className = 'post-share-actions';
    const shareButton = document.createElement('button');
    shareButton.className = 'share-story';
    shareButton.type = 'button';
    shareButton.textContent = 'Share this story';
    const shareStatus = document.createElement('span');
    shareStatus.className = 'share-status';
    shareStatus.setAttribute('role', 'status');
    shareStatus.setAttribute('aria-live', 'polite');
    shareButton.addEventListener('click', async () => {
      const url = new URL(`/blog.html?post=${encodeURIComponent(postSlug(post))}`, window.location.origin).href;
      try {
        if (navigator.share) {
          await navigator.share({ title: post.title, text: post.summary, url });
        } else {
          await navigator.clipboard.writeText(url);
          shareStatus.textContent = 'Story link copied.';
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Could not share the blog story.', error);
          shareStatus.textContent = 'Sharing failed. Please try again.';
        }
      }
    });
    actions.append(shareButton, shareStatus);
    content.append(body, actions);
  } else {
    const readLink = document.createElement('a');
    readLink.className = 'read-story';
    readLink.href = articleUrlFor(post);
    readLink.textContent = 'Read story';
    readLink.setAttribute('aria-label', `Read story: ${post.title}`);
    content.append(readLink);
  }

  article.append(content);
  return article;
}

async function loadPosts() {
  try {
    const response = await fetch('/blog/posts.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Blog posts could not be loaded (HTTP ${response.status}).`);
    }

    const posts = await response.json();
    if (!Array.isArray(posts) || posts.length === 0) {
      throw new Error('The blog archive is empty or invalid.');
    }

    const selectedSlug = new URL(window.location.href).searchParams.get('post');
    const selectedPost = selectedSlug && posts.find((post) => postSlug(post) === selectedSlug);

    if (selectedSlug && !selectedPost) {
      throw new Error(`The requested blog story was not found: ${selectedSlug}`);
    }

    if (selectedPost) {
      const backLink = document.createElement('a');
      backLink.className = 'back-link';
      backLink.href = '/blog.html';
      backLink.textContent = '← All stories';
      postsContainer.classList.add('is-detail');
      postsContainer.replaceChildren(backLink, makePost(selectedPost, { detail: true }));
      postCount.textContent = '1 story';
      updateMeta(selectedPost);
    } else {
      postsContainer.classList.remove('is-detail');
      postsContainer.replaceChildren(...posts.map((post, index) => makePost(post, { featured: index === 0 })));
      postCount.textContent = `${posts.length} ${posts.length === 1 ? 'story' : 'stories'}`;
    }
  } catch (error) {
    console.error(error);
    loadError.hidden = false;
    postsContainer.replaceChildren();
  } finally {
    postsContainer.setAttribute('aria-busy', 'false');
  }
}

loadPosts();
