import Axios from "axios";
import Downloader from "../downloader.js";
import { parse } from 'node-html-parser';

export default class Post {
  id;
  title;
  data;
  constructor(postId) {
    this.id = postId;
  }

  async getInformation() {
    console.log("Fetching information for", this.id);
    if (!this.data)
      await Axios.request({
        method: "GET",
        url: `https://fantia.jp/posts/${this.id}`,
        headers: {
          Cookie: `_session_id=${process.env.SESSION_ID}`,
        },
      }).then(response => this.getInformation2(response));

    return Promise.resolve(this.data);
  }

  async getInformation2(response) {
    var HTMLParser = parse(response.data);
    var token = this.getCsrfToken(HTMLParser);
    if (!this.data)
      await Axios.request({
        method: "GET",
        url: `https://fantia.jp/api/v1/posts/${this.id}`,
        headers: {
          Cookie: `_session_id=${process.env.SESSION_ID}`,
          "X-CSRF-Token": token,
        },
      }).then(response => {
        this.data = response.data.post;
        this.title = this.data.title;
      });

  }

  async getContents() {
    let postInfo = await this.getInformation();
    return postInfo.post_contents;
  }

  async getImages() {
    let contents = await this.getContents();
    let images = await Promise.all(contents.map(this.contentImageConverter));
    return images.flat();
  }

  async contentImageConverter(content) {
    if (!content.post_content_photos)
      return Promise.resolve([]);

    let images = content.post_content_photos.map(photo => ({
      type: "image",
      id: photo.id,
      title: content.title,
      filename: "",
      url: photo.url.original,
    }));

    return Promise.resolve(images);
  }

  async getVideos() {
    let content = await this.getContents();
    let videos = await Promise.all(content.map(this.contentVideoConverter));
    return videos.flat();
  }

  async contentVideoConverter(content) {
    if (!content.download_uri)
      return Promise.resolve([]);

    return Promise.resolve({
      type: "video",
      id: content.id,
      title: content.title,
      filename: content.filename,
      url: "https://fantia.jp" + content.download_uri,
    });
  }

  async getMedias() {
    return Promise.resolve({
      images: await this.getImages(),
      videos: await this.getVideos(),
    });
  }

  async save() {
    await this.getInformation();
    let prefix = `${this.id}-${this.title}`;
    let downloader = new Downloader(prefix);
    console.log("Downloader created for:", `${this.id}-${this.title}`);

    if (this.data.thumb)
      await downloader.download(this.data.thumb.original, `${prefix}-cover`);

    let images = await this.getImages();
    console.log(`Total ${images.length} images to download.`);
    await Promise.all(images.map(async image => {
      return await downloader.download(image.url, `${prefix}-${image.id}`);
    }));

    let videos = await this.getVideos();
    console.log(`Total ${videos.length} videos to download.`);
    await Promise.all(videos.map(async video => {
      return await downloader.download(video.url, `${prefix}-${video.id}`);
    }));

    console.log("Download success.");
  }

  getCsrfToken(html) {
    var contentstr = 'content="'
    var undefined;
    var csrf_token = ""
    get_token(html)
    function get_token(html_sub){
      if(html_sub.rawAttrs != undefined && html_sub.rawAttrs != "" && html_sub.rawAttrs.indexOf('csrf-token') != -1){
        var idx = html_sub.rawAttrs.indexOf(contentstr)
        csrf_token = html_sub.rawAttrs.substr(idx+contentstr.length).split('"')[0];
      }
      for (let i = 0; i < html_sub.childNodes.length; i++) {
        get_token(html_sub.childNodes[i]);
      }
    }
    return csrf_token;
  }
}
