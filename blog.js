const postsContainer = document.getElementById('posts');
const postCount = document.getElementById('postCount');
const loadError = document.getElementById('loadError');
const postSlug = (post) => {
  const titleSlug = post.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${post.date}-${titleSlug}`;
};

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
    imageLink.href = `/blog.html?post=${encodeURIComponent(postSlug(post))}`;
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
    titleLink.href = `/blog.html?post=${encodeURIComponent(postSlug(post))}`;
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
    content.append(body);
  } else {
    const readLink = document.createElement('a');
    readLink.className = 'read-story';
    readLink.href = `/blog.html?post=${encodeURIComponent(postSlug(post))}`;
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
      document.title = `${selectedPost.title} | RocketGPT Blog`;
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
