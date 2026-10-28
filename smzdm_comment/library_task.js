const { SmzdmBot, requestApi, removeTags, wait } = require('./bot');
const { SmzdmCommentClient } = require('./comment_client');

// ------------------------------------

class SmzdmTaskBot extends SmzdmBot {
  constructor(cookie, env) {
    super(cookie);

    this.$env = env;
  }

  // 执行任务列表中的任务
  async doTasks(tasks) {
    let notifyMsg = '';
    const comments = tasks.filter(task => task.task_event_type === 'interactive.comment').sort((a, b) => Number(a.task_even_num) - Number(b.task_even_num));
    tasks = tasks.map(task => task.task_event_type === 'interactive.comment' ? comments.shift() : task);

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];

      // 待领取任务
      if (task.task_status == '3') {
        this.$env.log(`领取[${task.task_name}]奖励:`);

        const { isSuccess } = task.task_event_type === 'interactive.comment' ? await this.doCommentTask(task) : await this.receiveReward(task.task_id);

        notifyMsg += `${isSuccess ? '🟢' : '❌'}领取[${task.task_name}]奖励${isSuccess ? '成功' : '失败！请查看日志'}\n`;

        await wait(5, 15);
      }
      // 未完成任务
      else if (task.task_status == '2') {
        // 浏览文章任务
        if (task.task_event_type == 'interactive.view.article') {
          const { isSuccess } = await this.doViewTask(task);

          notifyMsg += this.getTaskNotifyMessage(isSuccess, task);

          await wait(5, 15);
        }
        // 分享任务
        else if (task.task_event_type == 'interactive.share') {
          const { isSuccess } = await this.doShareTask(task);

          notifyMsg += this.getTaskNotifyMessage(isSuccess, task);

          await wait(5, 15);
        }
        // 抽奖任务
        else if (task.task_event_type == 'guide.crowd') {
          const { isSuccess, code } = await this.doCrowdTask(task);

          if (code !== 99) {
            notifyMsg += this.getTaskNotifyMessage(isSuccess, task);
          }

          await wait(5, 15);
        }
        // 关注用户任务
        else if (task.task_event_type == 'interactive.follow.user') {
          const { isSuccess } = await this.doFollowUserTask(task);

          notifyMsg += this.getTaskNotifyMessage(isSuccess, task);

          await wait(5, 15);
        }
        // 关注栏目任务
        else if (task.task_event_type == 'interactive.follow.tag') {
          const { isSuccess } = await this.doFollowTagTask(task);

          notifyMsg += this.getTaskNotifyMessage(isSuccess, task);

          await wait(5, 15);
        }
        // 关注品牌
        else if (task.task_event_type == 'interactive.follow.brand') {
          const { isSuccess } = await this.doFollowBrandTask(task);

          notifyMsg += this.getTaskNotifyMessage(isSuccess, task);

          await wait(5, 15);
        }
        // 收藏任务
        else if (task.task_event_type == 'interactive.favorite') {
          const { isSuccess } = await this.doFavoriteTask(task);

          notifyMsg += this.getTaskNotifyMessage(isSuccess, task);

          await wait(5, 15);
        }
        // 点赞任务
        else if (task.task_event_type == 'interactive.rating') {
          const { isSuccess } = await this.doRatingTask(task);

          notifyMsg += this.getTaskNotifyMessage(isSuccess, task);

          await wait(5, 15);
        }
        // 评论任务
        else if (task.task_event_type == 'interactive.comment') {
          if (process.env.SMZDM_COMMENT_AUTO === 'true' || (process.env.SMZDM_COMMENT && String(process.env.SMZDM_COMMENT).length > 10)) {
            const { isSuccess, reason } = await this.doCommentTask(task);

            notifyMsg += this.getTaskNotifyMessage(isSuccess, task);
            if (reason) { notifyMsg += reason + '\n'; this.$env.log(`评论任务[${task.task_name}]: ${reason}`); }

            await wait(5, 15);
          }
          else {
            this.$env.log('🟡请设置 SMZDM_COMMENT 环境变量后才能做评论任务！');
          }
        }
      }
    }

    return notifyMsg;
  }

  getTaskNotifyMessage(isSuccess, task) {
    return `${isSuccess ? '🟢' : '❌'}完成[${task.task_name}]任务${isSuccess ? '成功' : '失败！请查看日志'}\n`;
  }

  // 执行评论任务
  commentTaskScope(task, content = process.env.SMZDM_COMMENT || '') {
    let redirect = task.task_redirect_url || {};
    if (typeof redirect === 'string') {
      try { redirect = JSON.parse(redirect); } catch (_) { return { kind: 'blocked', reason: '\u8bc4\u8bba\u4efb\u52a1\u8df3\u8f6c\u4fe1\u606f\u65e0\u6548' }; }
    }
    const configuredTopics = [...String(content).matchAll(/#([^#]+)#/g)].map(match => match[1]);
    const normalizeTopic = value => String(value || '').replace(/[\s#]/g, '').toLowerCase();
    const provenTopics = normalizeTopic([task.task_name, task.task_description, redirect.link_title].filter(Boolean).join(' '));
    if (configuredTopics.some(topic => !provenTopics.includes(normalizeTopic(topic)))) {
      return { kind: 'blocked', reason: '\u8bc4\u8bba\u6587\u6848\u542b\u56fa\u5b9a\u8bdd\u9898\uff0c\u4e0e\u4efb\u52a1\u76ee\u6807\u672a\u786e\u8ba4\u5339\u914d\uff1b\u8bf7\u5148\u6838\u5bf9\u6587\u6848' };
    }
    const type = String(redirect.link_type || '').toLowerCase();
    const positive = value => /^[1-9]\d*$/.test(String(value || '')) ? String(value) : '';
    const links = [redirect.link, redirect.scheme_url].filter(Boolean).join('&');
    const topicIds = [...links.matchAll(/[?&](?:tag_id|topic_id|theme_id)=([1-9]\d*)/g)].map(match => match[1]);
    const columnIds = [...links.matchAll(/[?&](?:lanmu_id)=([1-9]\d*)/g)].map(match => match[1]);
    const taskText = `${task.task_name || ''} ${task.task_description || ''}`;
    if (/(?:\u8bc4\u8bba|\u6587\u6848|\u5185\u5bb9).*(?:\u5305\u542b|\u5e26\u4e0a|\u8bdd\u9898\u6807\u7b7e)/.test(taskText)) {
      return { kind: 'blocked', reason: '\u4efb\u52a1\u8981\u6c42\u7279\u5b9a\u8bc4\u8bba\u5185\u5bb9\uff0c\u8bf7\u5148\u6838\u5bf9\u6587\u6848' };
    }
    if (type === 'jingxuan' && /全站范围/.test(taskText)) return { kind: 'general' };
    if (['tag', 'theme', 'topic'].includes(type) || topicIds.length) {
      const ids = [positive(redirect.link_val), ...topicIds].filter(Boolean);
      if (columnIds.length || new Set(ids).size !== 1) return { kind: 'blocked', reason: '\u6307\u5b9a\u8bdd\u9898ID\u7f3a\u5931\u6216\u51b2\u7a81' };
      return { kind: 'topic', id: ids[0], title: redirect.link_title || '' };
    }
    if (type === 'lanmu' || columnIds.length) {
      const ids = [positive(redirect.link_val), ...columnIds].filter(Boolean);
      if (new Set(ids).size !== 1) return { kind: 'blocked', reason: '\u6307\u5b9a\u680f\u76eeID\u7f3a\u5931\u6216\u51b2\u7a81' };
      return { kind: 'column', id: ids[0], title: redirect.link_title || '' };
    }
    const articleRef = ['article', 'post'].includes(type) && /^[a-zA-Z0-9]+$/.test(String(redirect.link_val || '')) ? String(redirect.link_val) : '';
    const articleId = articleRef || positive(task.article_id) || (['article', 'post', 'haojia'].includes(type) ? positive(redirect.link_val) : '');
    if (articleId) return { kind: 'article', id: articleId, channelId: positive(task.channel_id) };
    if (!['', 'home'].includes(type) || /\u6307\u5b9a|\u8bdd\u9898|\u680f\u76ee|#[^#]+#/.test(taskText) || positive(redirect.link_val)) {
      return { kind: 'blocked', reason: '\u65e0\u6cd5\u786e\u8ba4\u6307\u5b9a\u8bc4\u8bba\u8303\u56f4\uff0c\u4e0d\u4f7f\u7528\u666e\u901a\u6587\u7ae0\u4ee3\u66ff' };
    }
    return { kind: 'general' };
  }

  async getCommentArticles(scope) {
    const requestApi = (url, options) => this.getCommentClient().request(url, options);
    if (scope.kind === 'general') {
      const relatedTasks = await this.getCommentClient().getCommentTasks();
      const relatedArticles = [];
      for (const task of relatedTasks) {
        const relatedScope = this.commentTaskScope(task, '');
        if (relatedScope.kind === 'article') relatedArticles.push(...await this.getCommentArticles(relatedScope));
      }
      const { isSuccess, data } = await requestApi('https://article-api.smzdm.com/ranking_list/article_and_biji', {
        headers: this.getHeaders(), retry: { limit: 0 }, timeout: { request: 15000 },
        data: { tab: '2', order: '1', offset: 0, exclude_article_ids: '' }
      });
      return relatedArticles.concat(isSuccess && Array.isArray(data?.data?.rows) ? data.data.rows.slice(0, 20) : []);
    }
    if (scope.kind === 'column') return await this.getCommentClient().getArticleListFromLanmu(scope.id, 20);
    if (scope.kind === 'article') {
      const detail = await this.getCommentClient().getArticleDetail(scope.id);
      const channel = scope.channelId || detail?.channel_id;
      return detail && channel ? [{ article_id: scope.id, article_channel_id: channel }] : [];
    }
    if (scope.kind === 'topic') {
      const { isSuccess, data } = await requestApi('https://article-api.smzdm.com/shaiwu/shaiwu_juhe_new', {
        headers: this.getHeaders(), retry: { limit: 0 }, timeout: { request: 15000 },
        data: { page: 1, size: 20, tag_id: scope.id, tab_id: '0', middle_page: '' }
      });
      if (!isSuccess || !Array.isArray(data?.data?.rows) ||
          (data.data.tag_id && String(data.data.tag_id) !== scope.id)) return [];
      return data.data.rows;
    }
    return [];
  }

  getCommentClient() {
    if (!this._commentClient) this._commentClient = new SmzdmCommentClient(this.cookie, this.$env);
    return this._commentClient;
  }

  async doCommentTask(task, options = {}) {
    return await this.getCommentClient().completeTask(task, this, options);
  }

  // 执行点赞任务
  async doRatingTask(task) {
    this.$env.log(`开始任务: ${task.task_name}`);

    let article;

    if (task.task_description.indexOf('任意') >= 0 || task.task_redirect_url.link_val == '0' || !task.task_redirect_url.link_val) {
      // 随机选一篇文章
      const articles = await this.getArticleList(20);

      if (articles.length < 1) {
        return {
          isSuccess: false
        };
      }

      article = this.getOneByRandom(articles);
    }
    else if (task.task_redirect_url.link_type === 'lanmu') {
      // 从栏目获取文章
      const articles = await this.getArticleListFromLanmu(task.task_redirect_url.link_val, 20);

      if (articles.length < 1) {
        return {
          isSuccess: false
        };
      }

      article = this.getOneByRandom(articles);
    }
    else if (task.task_redirect_url.link != '' && task.task_redirect_url.link_val != '') {
      const channelId = await this.getArticleChannelIdForTesting(task.task_redirect_url.link);

      if (!channelId) {
        return {
          isSuccess: false
        };
      }

      article = {
        'article_id': task.task_redirect_url.link_val,
        'article_channel_id': channelId
      };
    }
    else {
      this.$env.log('尚未支持');

      return {
        isSuccess: false
      };
    }

    await wait(3, 10);

    if (article.article_price) {
      // 点值
      await this.rating({
        method: 'worth_cancel',
        type: 3,
        id: article.article_id,
        channelId: article.article_channel_id
      });

      await wait(3, 10);

      await this.rating({
        method: 'worth_create',
        type: 1,
        id: article.article_id,
        channelId: article.article_channel_id
      });

      await wait(3, 10);

      await this.rating({
        method: 'worth_cancel',
        type: 3,
        id: article.article_id,
        channelId: article.article_channel_id
      });
    }
    else {
      // 点赞
      await this.rating({
        method: 'like_cancel',
        id: article.article_id,
        channelId: article.article_channel_id
      });

      await wait(3, 10);

      await this.rating({
        method: 'like_create',
        id: article.article_id,
        channelId: article.article_channel_id
      });

      await wait(3, 10);

      await this.rating({
        method: 'like_cancel',
        id: article.article_id,
        channelId: article.article_channel_id
      });

      await wait(3, 10);

      await this.rating({
        method: 'like_create',
        id: article.article_id,
        channelId: article.article_channel_id
      });

      await wait(3, 10);

      await this.rating({
        method: 'like_cancel',
        id: article.article_id,
        channelId: article.article_channel_id
      });
    }

    this.$env.log('领取奖励');
    await wait(5, 15);

    return await this.receiveReward(task.task_id);
  }

  // 执行收藏任务
  async doFavoriteTask(task) {
    this.$env.log(`开始任务: ${task.task_name}`);

    let articleId = '';
    let channelId = '';

    if (task.task_redirect_url.link_type === 'lanmu') {
      // 从栏目获取文章
      const articles = await this.getArticleListFromLanmu(task.task_redirect_url.link_val, 20);

      if (articles.length < 1) {
        return {
          isSuccess: false
        };
      }

      const article = this.getOneByRandom(articles);

      articleId = article.article_id;
      channelId = article.article_channel_id;
    }
    else if (task.task_redirect_url.link_type === 'tag') {
      // 从 Tag 获取文章
      const articles = await this.getArticleListFromTag(task.task_redirect_url.link_val, task.task_redirect_url.link_title, 20);

      if (articles.length < 1) {
        return {
          isSuccess: false
        };
      }

      const article = this.getOneByRandom(articles);

      articleId = article.article_id;
      channelId = article.article_channel_id;
    }
    else if (task.task_redirect_url.link_val == '0' || !task.task_redirect_url.link_val) {
      // 随机选一篇文章
      const articles = await this.getArticleList(20);

      if (articles.length < 1) {
        return {
          isSuccess: false
        };
      }

      const article = this.getOneByRandom(articles);

      articleId = article.article_id;
      channelId = article.article_channel_id;
    }
    else {
      articleId = task.task_redirect_url.link_val;

      // 获取文章信息
      const articleDetail = await this.getArticleDetail(articleId);

      if (articleDetail === false) {
        return {
          isSuccess: false
        };
      }

      channelId = articleDetail.channel_id;
    }

    await wait(3, 10);

    await this.favorite({
      method: 'destroy',
      id: articleId,
      channelId
    });

    await wait(3, 10);

    await this.favorite({
      method: 'create',
      id: articleId,
      channelId
    });

    await wait(3, 10);

    await this.favorite({
      method: 'destroy',
      id: articleId,
      channelId
    });

    this.$env.log('领取奖励');
    await wait(5, 15);

    return await this.receiveReward(task.task_id);
  }

  // 执行关注用户任务
  async doFollowUserTask(task) {
    this.$env.log(`开始任务: ${task.task_name}`);

    // 随机选一个用户
    const user = await this.getUserByRandom();

    if (!user) {
      return {
        isSuccess: false
      };
    }

    await wait(3, 10);

    for (let i = 0; i < Number(task.task_even_num - task.task_finished_num); i++) {
      if (user.is_follow == '1') {
        await this.follow({
          method: 'destroy',
          type: 'user',
          keyword: user.keyword
        });

        await wait(3, 10);
      }

      await this.follow({
        method: 'create',
        type: 'user',
        keyword: user.keyword
      });

      await wait(3, 10);

      if (user.is_follow == '0') {
        await this.follow({
          method: 'destroy',
          type: 'user',
          keyword: user.keyword
        });
      }

      await wait(3, 10);
    }

    this.$env.log('领取奖励');
    await wait(5, 15);

    return await this.receiveReward(task.task_id);
  }

  // 执行关注栏目任务（先取关，再关注，最后取关）
  async doFollowTagTask(task) {
    this.$env.log(`开始任务: ${task.task_name}`);

    let lanmuId = '';

    if (task.task_redirect_url.link_val == '0') {
      const tag = await this.getTagByRandom();

      if (tag === false) {
        return {
          isSuccess: false
        };
      }

      lanmuId = tag.lanmu_id;

      await wait(3, 10);
    }
    else {
      lanmuId = task.task_redirect_url.link_val;
    }

    // 获取栏目信息
    const tagDetail = await this.getTagDetail(lanmuId);

    if (!tagDetail.lanmu_id) {
      this.$env.log('获取栏目信息失败！');

      return {
        isSuccess: false
      };
    }

    await wait(3, 10);

    await this.follow({
      method: 'destroy',
      type: 'tag',
      keywordId: tagDetail.lanmu_id,
      keyword: tagDetail.lanmu_info.lanmu_name
    });

    await wait(3, 10);

    await this.follow({
      method: 'create',
      type: 'tag',
      keywordId: tagDetail.lanmu_id,
      keyword: tagDetail.lanmu_info.lanmu_name
    });

    await wait(3, 10);

    await this.follow({
      method: 'destroy',
      type: 'tag',
      keywordId: tagDetail.lanmu_id,
      keyword: tagDetail.lanmu_info.lanmu_name
    });

    this.$env.log('领取奖励');
    await wait(5, 15);

    return await this.receiveReward(task.task_id);
  }

  // 执行关注品牌任务（先取关，再关注，最后取关）
  async doFollowBrandTask(task) {
    this.$env.log(`开始任务: ${task.task_name}`);

    // 获取品牌信息
    const brandDetail = await this.getBrandDetail(task.task_redirect_url.link_val);

    if (!brandDetail.id) {
      return {
        isSuccess: false
      };
    }

    await wait(3, 10);

    await this.followBrand({
      method: 'dingyue_lanmu_del',
      keywordId: brandDetail.id,
      keyword: brandDetail.title
    });

    await wait(3, 10);

    await this.followBrand({
      method: 'dingyue_lanmu_add',
      keywordId: brandDetail.id,
      keyword: brandDetail.title
    });

    await wait(3, 10);

    await this.followBrand({
      method: 'dingyue_lanmu_del',
      keywordId: brandDetail.id,
      keyword: brandDetail.title
    });

    this.$env.log('领取奖励');
    await wait(5, 15);

    return await this.receiveReward(task.task_id);
  }

  // 执行抽奖任务
  async doCrowdTask(task) {
    this.$env.log(`开始任务: ${task.task_name}`);

    let { isSuccess, data } = await this.getCrowd('免费', 0);

    if (!isSuccess) {
      if (process.env.SMZDM_CROWD_SILVER_5 == 'yes') {
        ({ isSuccess, data } = await this.getCrowd('5碎银子', 5));

        if (!isSuccess) {
          return {
            isSuccess,
            code: 99
          };
        }
      }
      else {
        this.$env.log('🟡请设置 SMZDM_CROWD_SILVER_5 环境变量值为 yes 后才能进行5碎银子抽奖！');

        return {
          isSuccess,
          code: 99
        };
      }
    }

    await wait(5, 15);

    const result = await this.joinCrowd(data);

    if (!result.isSuccess) {
      return {
        isSuccess: result.isSuccess
      };
    }

    this.$env.log('领取奖励');
    await wait(5, 15);

    return await this.receiveReward(task.task_id);
  }

  // 执行文章分享任务
  async doShareTask(task) {
    this.$env.log(`开始任务: ${task.task_name}`);

    let articles = [];

    if (task.article_id == '0') {
      articles = await this.getArticleList(task.task_even_num - task.task_finished_num);

      await wait(3, 10);
    }
    else {
      articles = [{
        article_id: task.article_id,
        article_channel_id: task.channel_id
      }];
    }

    for (let i = 0; i < articles.length; i++) {
      this.$env.log(`开始分享第 ${i + 1} 篇文章...`);

      const article = articles[i];

      if (task.task_redirect_url.link_type != 'other') {
        // 模拟打开文章
        if (/detail_haojia/i.test(task.task_redirect_url.scheme_url)) {
          await this.getHaojiaDetail(article.article_id);
        }
        else {
          await this.getArticleDetail(article.article_id);
        }

        await wait(8, 20);
      }

      await this.shareArticleDone(article.article_id, article.article_channel_id);
      await this.shareDailyReward(article.article_channel_id);
      await this.shareCallback(article.article_id, article.article_channel_id);

      await wait(5, 15);
    }

    this.$env.log('领取奖励');
    await wait(3, 10);

    return await this.receiveReward(task.task_id);
  }

  // 执行浏览任务
  async doViewTask(task) {
    this.$env.log(`开始任务: ${task.task_name}`);

    let articles = [];
    let isRead = true;

    if (task.article_id == '0') {
      isRead = true;
      articles = await this.getArticleList(task.task_even_num - task.task_finished_num);

      await wait(3, 10);
    }
    else {
      for (let i = 0; i < task.task_even_num - task.task_finished_num; i++) {
        articles.push({
          article_id: task.article_id,
          article_channel_id: task.channel_id
        });
      }

      isRead = task.task_redirect_url.link_val != '';
    }

    for (let i = 0; i < articles.length; i++) {
      this.$env.log(`开始阅读第 ${i + 1} 篇文章...`);

      const article = articles[i];

      if (isRead) {
        // 模拟打开文章
        if (/detail_haojia/i.test(task.task_redirect_url.scheme_url)) {
          await this.getHaojiaDetail(article.article_id);
        }
        else {
          await this.getArticleDetail(article.article_id);
        }
      }

      this.$env.log('模拟阅读文章');
      await wait(20, 50);

      const { isSuccess, response } = await requestApi('https://user-api.smzdm.com/task/event_view_article_sync', {
        method: 'post',
        headers: this.getHeaders(),
        data: {
          article_id: article.article_id,
          channel_id: article.article_channel_id,
          task_id: task.task_id
        }
      });

      if (isSuccess) {
        this.$env.log('完成阅读成功。');
      }
      else {
        this.$env.log(`完成阅读失败！${response}`);
      }

      await wait(5, 15);
    }

    this.$env.log('领取奖励');
    await wait(3, 10);

    return await this.receiveReward(task.task_id);
  }

  // 关注/取关
  async follow({keywordId, keyword, type, method}) {
    let touchstone = '';

    if (type === 'user') {
      touchstone = this.getTouchstoneEvent({
        event_value: {
          cid: 'null',
          is_detail: false,
          p: '1'
        },
        sourceMode: '我的_我的任务页',
        sourcePage: 'Android/关注/达人/爆料榜',
        upperLevel_url: '关注/达人/推荐/'
      });
    }
    else if (type === 'tag') {
      touchstone = this.getTouchstoneEvent({
        event_value: {
          cid: 'null',
          is_detail: false
        },
        sourceMode: '栏目页',
        sourcePage: `Android/栏目页/${keyword}/${keywordId}/`,
        source_page_type_id: String(keywordId),
        upperLevel_url: '个人中心/赚奖励/',
        source_area: {
          lanmu_id: String(keywordId),
          prev_source_scence: '我的_我的任务页'
        }
      });
    }

    const { isSuccess, response } = await requestApi(`https://dingyue-api.smzdm.com/dingyue/${method}`, {
      method: 'post',
      headers: this.getHeaders(),
      data: {
        touchstone_event: touchstone,
        refer: '',
        keyword_id: keywordId,
        keyword,
        type
      }
    });

    if (isSuccess) {
      this.$env.log(`${method} 关注成功: ${keyword}`);
    }
    else {
      this.$env.log(`${method} 关注失败！${response}`);
    }

    return {
      isSuccess,
      response
    };
  }

  // 随机获取用户
  async getUserByRandom() {
    const { isSuccess, data, response } = await requestApi('https://dingyue-api.smzdm.com/tuijian/search_result', {
      method: 'post',
      headers: this.getHeaders(),
      data: {
        nav_id: 0,
        page: 1,
        type: 'user',
        time_code: ''
      }
    });

    if (isSuccess) {
      return data.data.rows[Math.floor(Math.random() * data.data.rows.length)];
    }
    else {
      this.$env.log(`获取用户列表失败！${response}`);

      return false;
    }
  }

  // 参加抽奖
  async joinCrowd(id) {
    const { isSuccess, data, response } = await requestApi('https://zhiyou.m.smzdm.com/user/crowd/ajax_participate', {
      method: 'post',
      sign: false,
      headers: {
        ...this.getHeadersForWeb(),
        Origin: 'https://zhiyou.m.smzdm.com',
        Referer: `https://zhiyou.m.smzdm.com/user/crowd/p/${id}/`
      },
      data: {
        crowd_id: id,
        sourcePage: `https://zhiyou.m.smzdm.com/user/crowd/p/${id}/`,
        client_type: 'android',
        sourceRoot: '个人中心',
        sourceMode: '幸运屋抽奖',
        price_id: 1
      }
    });

    if (isSuccess) {
      this.$env.log(removeTags(data.data.msg));
    }
    else {
      this.$env.log(`参加免费抽奖失败: ${response}`);
    }

    return {
      isSuccess,
      response
    };
  }

  // 获取抽奖信息
  async getCrowd(name, price) {
    const { isSuccess, data, response } = await requestApi('https://zhiyou.smzdm.com/user/crowd/', {
      sign: false,
      parseJSON: false,
      headers: this.getHeadersForWeb()
    });

    const re = new RegExp(`<button\\s+([^>]+?)>\\s+?<div\\s+[^>]+?>\\s*${name}(?:抽奖)?\\s*<\\/div>\\s+<span\\s+class="reduceNumber">-${price}<\\/span>[\\s\\S]+?<\\/button>`, 'ig');

    if (isSuccess) {
      const crowds = [];
      let match;

      while ((match = re.exec(data)) !== null) {
        crowds.push(match[1]);
      }

      if (crowds.length < 1) {
        this.$env.log(`未找到${name}抽奖`);

        return {
          isSuccess: false
        };
      }

      let crowd;

      if (price > 0 && process.env.SMZDM_CROWD_KEYWORD) {
        crowd = crowds.find((item) => {
          const match = item.match(/data-title="([^"]+)"/i);

          return (match && match[1].indexOf(process.env.SMZDM_CROWD_KEYWORD) >= 0);
        });

        if (!crowd) {
          this.$env.log('未找到符合关键词的抽奖，执行随机选取');
          crowd = this.getOneByRandom(crowds);
        }
      }
      else {
        crowd = this.getOneByRandom(crowds);
      }

      const matchCrowd = crowd.match(/data-crowd_id="(\d+)"/i);

      if (matchCrowd) {
        this.$env.log(`${name}抽奖ID: ${matchCrowd[1]}`);

        return {
          isSuccess: true,
          data: matchCrowd[1]
        };
      }
      else {
        this.$env.log(`未找到${name}抽奖ID`);

        return {
          isSuccess: false
        };
      }
    }
    else {
      this.$env.log(`获取${name}抽奖失败: ${response}`);

      return {
        isSuccess: false
      };
    }
  }

  // 分享完成
  async shareArticleDone(articleId, channelId) {
    const { isSuccess, response } = await requestApi('https://user-api.smzdm.com/share/complete_share_rule', {
      method: 'post',
      headers: this.getHeaders(),
      data: {
        token: this.token,
        article_id: articleId,
        channel_id: channelId,
        tag_name: 'gerenzhongxin'
      }
    });

    if (isSuccess) {
      this.$env.log('完成分享成功。');

      return {
        isSuccess,
        msg: '完成分享成功。'
      };
    }
    else {
      this.$env.log(`完成分享失败！${response}`);

      return {
        isSuccess: false,
        msg: '完成分享失败！'
      };
    }
  }

  // 分享完成后回调接口
  async shareCallback(articleId, channelId) {
    const { isSuccess, response } = await requestApi('https://user-api.smzdm.com/share/callback', {
      method: 'post',
      headers: this.getHeaders(),
      data: {
        token: this.token,
        article_id: articleId,
        channel_id: channelId,
        touchstone_event: this.getTouchstoneEvent({
          event_value: {
            aid: articleId,
            cid: channelId,
            is_detail: true,
            pid: '无'
          },
          sourceMode: '排行榜_社区_好文精选',
          sourcePage: `Android/长图文/P/${articleId}/`,
          upperLevel_url: '排行榜/社区/好文精选/文章_24H/'
        })
      }
    });

    if (isSuccess) {
      this.$env.log('分享回调完成。');

      return {
        isSuccess,
        msg: ''
      };
    }
    else {
      this.$env.log(`分享回调失败！${response}`);

      return {
        isSuccess,
        msg: '分享回调失败！'
      };
    }
  }

  // 分享的每日奖励（貌似没啥用）
  async shareDailyReward(channelId) {
    const { isSuccess, data, response } = await requestApi('https://user-api.smzdm.com/share/daily_reward', {
      method: 'post',
      headers: this.getHeaders(),
      data: {
        token: this.token,
        channel_id: channelId
      }
    });

    if (isSuccess) {
      this.$env.log(data.data.reward_desc);

      return {
        isSuccess,
        msg: data.data.reward_desc
      };
    }
    else {
      if (data) {
        this.$env.log(data.error_msg);

        return {
          isSuccess,
          msg: data.error_msg
        };
      }
      else {
        this.$env.log(`分享每日奖励请求失败！${response}`);

        return {
          isSuccess,
          msg: '分享每日奖励请求失败！'
        };
      }
    }
  }

  // 获取文章列表
  async getArticleList(num = 1) {
    const { isSuccess, data, response } = await requestApi('https://article-api.smzdm.com/ranking_list/articles', {
      headers: this.getHeaders(),
      data: {
        offset: 0,
        channel_id: 76,
        tab: 2,
        order: 0,
        limit: 20,
        exclude_article_ids: '',
        stream: 'a',
        ab_code: 'b'
      }
    });

    if (isSuccess) {
      // 取前 num 个做任务
      return data.data.rows.slice(0, num);
    }
    else {
      this.$env.log(`获取文章列表失败: ${response}`);
      return [];
    }
  }

  async getRobotToken() {
    const { isSuccess, data, response } = await requestApi('https://user-api.smzdm.com/robot/token', {
      method: 'post',
      headers: this.getHeaders()
    });

    if (isSuccess) {
      return data.data.token;
    }
    else {
      this.$env.log(`Robot Token 获取失败！${response}`);

      return false;
    }
  }

  // 获取栏目信息
  async getTagDetail(id) {
    const { isSuccess, data, response } = await requestApi('https://common-api.smzdm.com/lanmu/config_data', {
      headers: this.getHeaders(),
      data: {
        middle_page: '',
        tab_selects: '',
        redirect_params: id
      }
    });

    if (isSuccess) {
      return data.data;
    }
    else {
      this.$env.log(`获取栏目信息失败！${response}`);

      return {};
    }
  }

  // 获取栏目列表
  async getTagByRandom() {
    const { isSuccess, data, response } = await requestApi('https://dingyue-api.smzdm.com/tuijian/search_result', {
      headers: this.getHeaders(),
      data: {
        time_code: '',
        nav_id: '',
        type: 'tag',
        limit: 20
      }
    });

    if (isSuccess) {
      return data.data.rows[Math.floor(Math.random() * data.data.rows.length)];
    }
    else {
      this.$env.log(`获取栏目列表失败！${response}`);

      return false;
    }
  }

  // 获取文章详情
  async getArticleDetail(id) {
    const { isSuccess, data, response } = await requestApi(`https://article-api.smzdm.com/article_detail/${id}`, {
      headers: this.getHeaders(),
      data: {
        comment_flow: '',
        hashcode: '',
        lastest_update_time: '',
        uhome: 0,
        imgmode: 0,
        article_channel_id: 0,
        h5hash: ''
      }
    });

    if (isSuccess) {
      return data.data;
    }
    else {
      this.$env.log(`获取文章详情失败！${response}`);

      return false;
    }
  }

  // 获取好价详情
  async getHaojiaDetail(id) {
    const { isSuccess, data, response } = await requestApi(`https://haojia-api.smzdm.com/detail/${id}`, {
      headers: this.getHeaders(),
      data: {
        imgmode: 0,
        hashcode: '',
        h5hash: ''
      }
    });

    if (isSuccess) {
      return data.data;
    }
    else {
      this.$env.log(`获取好价详情失败！${response}`);

      return false;
    }
  }

  // 收藏
  async favorite({id, channelId, method}) {
    const { isSuccess, response } = await requestApi(`https://user-api.smzdm.com/favorites/${method}`, {
      method: 'post',
      headers: this.getHeaders(),
      data: {
        touchstone_event: this.getTouchstoneEvent({
          event_value: {
            aid: id,
            cid: channelId,
            is_detail: true
          },
          sourceMode: '我的_我的任务页',
          sourcePage: `Android/长图文/P/${id}/`,
          upperLevel_url: '个人中心/赚奖励/'
        }),
        token: this.token,
        id,
        channel_id: channelId
      }
    });

    if (isSuccess) {
      this.$env.log(`${method} 收藏成功: ${id}`);
    }
    else {
      this.$env.log(`${method} 收藏失败！${response}`);
    }

    return {
      isSuccess,
      response
    };
  }

  getTouchstoneEvent(obj) {
    const defaultObj = {
      search_tv: 'f',
      sourceRoot: '个人中心',
      trafic_version: '113_a,115_b,116_e,118_b,131_b,132_b,134_b,136_b,139_a,144_a,150_b,153_a,179_a,183_b,185_b,188_b,189_b,193_a,196_b,201_a,204_a,205_a,208_b,222_b,226_a,228_a,22_b,230_b,232_b,239_b,254_a,255_b,256_b,258_b,260_b,265_a,267_a,269_a,270_c,273_b,276_a,278_a,27_a,280_a,281_a,283_b,286_a,287_a,290_a,291_b,295_a,302_a,306_b,308_b,312_b,314_a,317_a,318_a,322_b,325_a,326_a,329_b,32_c,332_b,337_c,341_a,347_a,349_b,34_a,351_a,353_b,355_a,357_b,366_b,373_B,376_b,378_b,380_b,388_b,391_b,401_d,403_b,405_b,407_b,416_a,421_a,424_b,425_b,427_a,436_b,43_j,440_a,442_a,444_b,448_a,450_b,451_b,454_b,455_a,458_c,460_a,463_c,464_b,466_b,467_b,46_a,470_b,471_b,474_b,475_a,484_b,489_a,494_b,496_b,498_a,500_a,503_b,507_b,510_bb,512_b,515_a,520_a,522_b,525_c,527_b,528_a,59_a,65_b,85_b,102_b,103_a,106_b,107_b,10_f,11_b,120_a,143_b,157_g,158_c,159_c,160_f,161_d,162_e,163_a,164_a,165_a,166_f,171_a,174_a,175_e,176_d,209_b,225_a,235_a,236_b,237_c,272_b,296_c,2_f,309_a,315_b,334_a,335_d,339_b,346_b,361_b,362_d,367_b,368_a,369_e,374_b,381_c,382_b,383_d,385_b,386_c,389_i,38_b,390_d,396_a,398_b,3_a,413_a,417_a,418_c,419_b,420_b,422_e,428_a,430_a,431_d,432_e,433_a,437_b,438_c,478_b,479_b,47_a,480_a,481_b,482_a,483_a,488_b,491_j,492_j,504_b,505_a,514_a,518_b,52_d,53_d,54_v,55_z1,56_z3,66_a,67_i,68_a1,69_i,74_i,77_d,93_a',
      tv: 'z1'
    };

    return JSON.stringify({...defaultObj, ...obj});
  }

  // 关注品牌
  async followBrand({keywordId, keyword, method}) {
    const touchstone = this.getTouchstoneEvent({
      event_value: {
        cid: '44',
        is_detail: true,
        aid: String(keywordId)
      },
      sourceMode: '百科_品牌详情页',
      sourcePage: `Android/其他/品牌详情页/${keyword}/${keywordId}/`,
      upperLevel_url: '个人中心/赚奖励/'
    });

    const { isSuccess, response } = await requestApi(`https://dingyue-api.smzdm.com/dy/util/api/user_action`, {
      method: 'post',
      headers: this.getHeaders(),
      data: {
        action: method,
        params: JSON.stringify({
          keyword: keywordId,
          keyword_id: keywordId,
          type: 'brand'
        }),
        refer: `Android/其他/品牌详情页/${keyword}/${keywordId}/`,
        touchstone_event: touchstone
      }
    });

    if (isSuccess) {
      this.$env.log(`${method} 关注成功: ${keyword}`);
    }
    else {
      this.$env.log(`${method} 关注失败！${response}`);
    }

    return {
      isSuccess,
      response
    };
  }

  // 获取品牌信息
  async getBrandDetail(id) {
    const { isSuccess, data, response } = await requestApi('https://brand-api.smzdm.com/brand/brand_basic', {
      headers: this.getHeaders(),
      data: {
        brand_id: id
      }
    });

    if (isSuccess) {
      return data.data;
    }
    else {
      this.$env.log(`获取品牌信息失败！${response}`);

      return {};
    }
  }

  // 根据栏目信息获取文章列表
  async getArticleListFromLanmu(id, num = 1) {
    const lanmuDetail = await this.getTagDetail(id);

    if (!lanmuDetail.lanmu_id) {
      return [];
    }

    const { isSuccess, data, response } = await requestApi('https://common-api.smzdm.com/lanmu/list_data', {
      headers: this.getHeaders(),
      data: {
        price_lt: '',
        order: '',
        category_ids: '',
        price_gt: '',
        referer_article: '',
        tag_params: '',
        mall_ids: '',
        time_sort: '',
        page: 1,
        params: id,
        limit: 20,
        tab_params: lanmuDetail.tab[0].params
      }
    });

    if (isSuccess) {
      // 取前 num 个做任务
      return data.data.rows.slice(0, num);
    }
    else {
      this.$env.log(`获取文章列表失败: ${response}`);
      return [];
    }
  }

  // 点赞
  async rating({id, channelId, method, type}) {
    const { isSuccess, response } = await requestApi(`https://user-api.smzdm.com/rating/${method}`, {
      method: 'post',
      headers: this.getHeaders(),
      data: {
        touchstone_event: this.getTouchstoneEvent({
          event_value: {
            aid: id,
            cid: channelId,
            is_detail: true
          },
          sourceMode: '栏目页',
          sourcePage: `Android//P/${id}/`,
          upperLevel_url: '栏目页///'
        }),
        token: this.token,
        id,
        channel_id: channelId,
        wtype: type
      }
    });

    if (isSuccess) {
      this.$env.log(`${method} 点赞成功: ${id}`);
    }
    else {
      this.$env.log(`${method} 点赞失败！${response}`);
    }

    return {
      isSuccess,
      response
    };
  }

  // 发表评论
  async submitComment({ articleId, channelId, content }) {
    const { isSuccess, data, response } = await requestApi('https://comment-api.smzdm.com/comments/submit', {
      method: 'post',
      retry: { limit: 0 },
      timeout: { request: 15000 },
      headers: this.getHeaders(),
      data: {
        touchstone_event: this.getTouchstoneEvent({
          event_value: {
            aid: articleId,
            cid: channelId,
            is_detail: true
          },
          sourceMode: '好物社区_全部',
          sourcePage: `Android/长图文/${articleId}/评论页/`,
          upperLevel_url: '好物社区/首页/全部/',
          sourceRoot: '社区'
        }),
        reply_from: 3,
        smiles: 0,
        atta: 0,
        parentid: 0,
        token: this.token,
        article_id: articleId,
        channel_id: channelId,
        content
      }
    });

    if (isSuccess) {
      this.$env.log(`评论发表成功: ${data.data.comment_ID}`);
    }
    else {
      this.$env.log(`评论发表失败！${response}`);
    }

    return {
      isSuccess,
      data,
      response
    };
  }

  // 删除评论
  async removeComment(id) {
    const { isSuccess, response } = await requestApi('https://comment-api.smzdm.com/comments/delete_comment', {
      method: 'post',
      retry: { limit: 0 },
      timeout: { request: 15000 },
      headers: this.getHeaders(),
      data: {
        comment_id: id
      }
    });

    if (isSuccess) {
      this.$env.log(`评论删除成功: ${id}`);
    }
    else {
      this.$env.log(`评论删除失败！${response}`);
    }

    return {
      isSuccess,
      response
    };
  }

  // 获取 Dingyue 状态
  async getDingyueStatus(name) {
    const { isSuccess, data, response } = await requestApi('https://dingyue-api.smzdm.com/dingyue/follow_status', {
      method: 'post',
      headers: this.getHeaders(),
      data: {
        rules: JSON.stringify([{
          type: 'tag',
          keyword: name
        }])
      }
    });

    if (isSuccess) {
      return data;
    }
    else {
      this.$env.log(`获取订阅状态失败: ${response}`);
      return {};
    }
  }

  // 根据 Tag ID 获取文章列表
  async getArticleListFromTag(id, name, num = 1) {
    const status = this.getDingyueStatus(name);

    const { isSuccess, data, response } = await requestApi('https://tag-api.smzdm.com/theme/detail_feed', {
      headers: this.getHeaders(),
      data: {
        article_source: 1,
        past_num: 0,
        feed_sort: 2,
        smzdm_id: status.smzdm_id,
        tag_id: id,
        name,
        time_sort: 0,
        page: 1,
        article_tab: 0,
        limit: 20
      }
    });

    if (isSuccess) {
      // 取前 num 个做任务
      return data.data.rows.slice(0, num);
    }
    else {
      this.$env.log(`获取文章列表失败: ${response}`);
      return [];
    }
  }

  // 通过 url 获取文章 channel_id
  async getArticleChannelIdForTesting(url) {
    const { isSuccess, response } = await requestApi(url, {
      method: 'get',
      headers: this.getHeaders(),
      parseJSON: false,
      sign: false
    });

    if (!isSuccess) {
      this.$env.log(`获取文章信息失败！${response}`);

      return false;
    }

    // 通过正则提取页面中的 channel_id
    const re = /'channel_id'\s*:\s*'(\d+)'/;
    const matchRet = response.match(re);

    if (!matchRet) {
      this.$env.log(`获取文章信息失败！${response}`);

      return false;
    }

    return matchRet[1];
  }
}

module.exports = {
  SmzdmTaskBot
};
