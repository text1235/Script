const { SmzdmBot, requestApi, removeTags, wait } = require('./bot');
const { SmzdmCommentClient } = require('./comment_client');

// ------------------------------------

class SmzdmTaskBot extends SmzdmBot {
  constructor(cookie, env) {
    super(cookie);

    this.$env = env;
  }

  // ִ�������б��е�����
  async doTasks(tasks) {
    let notifyMsg = '';

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i];

      // ����ȡ����
      if (task.task_status == '3') {
        this.$env.log(`��ȡ[${task.task_name}]����:`);

        const { isSuccess } = task.task_event_type === 'interactive.comment' ? await this.doCommentTask(task) : await this.receiveReward(task.task_id);

        notifyMsg += `${isSuccess ? '??' : '?'}��ȡ[${task.task_name}]����${isSuccess ? '�ɹ�' : 'ʧ�ܣ���鿴��־'}\n`;

        await wait(5, 15);
      }
      // δ�������
      else if (task.task_status == '2') {
        // �����������
        if (task.task_event_type == 'interactive.view.article') {
          const { isSuccess } = await this.doViewTask(task);

          notifyMsg += this.getTaskNotifyMessage(isSuccess, task);

          await wait(5, 15);
        }
        // ��������
        else if (task.task_event_type == 'interactive.share') {
          const { isSuccess } = await this.doShareTask(task);

          notifyMsg += this.getTaskNotifyMessage(isSuccess, task);

          await wait(5, 15);
        }
        // �齱����
        else if (task.task_event_type == 'guide.crowd') {
          const { isSuccess, code } = await this.doCrowdTask(task);

          if (code !== 99) {
            notifyMsg += this.getTaskNotifyMessage(isSuccess, task);
          }

          await wait(5, 15);
        }
        // ��ע�û�����
        else if (task.task_event_type == 'interactive.follow.user') {
          const { isSuccess } = await this.doFollowUserTask(task);

          notifyMsg += this.getTaskNotifyMessage(isSuccess, task);

          await wait(5, 15);
        }
        // ��ע��Ŀ����
        else if (task.task_event_type == 'interactive.follow.tag') {
          const { isSuccess } = await this.doFollowTagTask(task);

          notifyMsg += this.getTaskNotifyMessage(isSuccess, task);

          await wait(5, 15);
        }
        // ��עƷ��
        else if (task.task_event_type == 'interactive.follow.brand') {
          const { isSuccess } = await this.doFollowBrandTask(task);

          notifyMsg += this.getTaskNotifyMessage(isSuccess, task);

          await wait(5, 15);
        }
        // �ղ�����
        else if (task.task_event_type == 'interactive.favorite') {
          const { isSuccess } = await this.doFavoriteTask(task);

          notifyMsg += this.getTaskNotifyMessage(isSuccess, task);

          await wait(5, 15);
        }
        // ��������
        else if (task.task_event_type == 'interactive.rating') {
          const { isSuccess } = await this.doRatingTask(task);

          notifyMsg += this.getTaskNotifyMessage(isSuccess, task);

          await wait(5, 15);
        }
        // ��������
        else if (task.task_event_type == 'interactive.comment') {
          if (process.env.SMZDM_COMMENT_AUTO === 'true' || (process.env.SMZDM_COMMENT && String(process.env.SMZDM_COMMENT).length > 10)) {
            const { isSuccess, reason } = await this.doCommentTask(task);

            notifyMsg += this.getTaskNotifyMessage(isSuccess, task);
            if (reason) notifyMsg += reason + '\n';

            await wait(5, 15);
          }
          else {
            this.$env.log('??������ SMZDM_COMMENT �����������������������');
          }
        }
      }
    }

    return notifyMsg;
  }

  getTaskNotifyMessage(isSuccess, task) {
    return `${isSuccess ? '??' : '?'}���[${task.task_name}]����${isSuccess ? '�ɹ�' : 'ʧ�ܣ���鿴��־'}\n`;
  }

  // ִ����������
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
    const articleId = positive(task.article_id) || (['article', 'post', 'haojia'].includes(type) ? positive(redirect.link_val) : '');
    if (articleId) return { kind: 'article', id: articleId, channelId: positive(task.channel_id) };
    if (!['', 'home'].includes(type) || /\u6307\u5b9a|\u8bdd\u9898|\u680f\u76ee|#[^#]+#/.test(taskText) || positive(redirect.link_val)) {
      return { kind: 'blocked', reason: '\u65e0\u6cd5\u786e\u8ba4\u6307\u5b9a\u8bc4\u8bba\u8303\u56f4\uff0c\u4e0d\u4f7f\u7528\u666e\u901a\u6587\u7ae0\u4ee3\u66ff' };
    }
    return { kind: 'general' };
  }

  async getCommentArticles(scope) {
    const requestApi = (url, options) => this.getCommentClient().request(url, options);
    if (scope.kind === 'general') {
      const { isSuccess, data } = await requestApi('https://article-api.smzdm.com/ranking_list/article_and_biji', {
        headers: this.getHeaders(), retry: { limit: 0 }, timeout: { request: 15000 },
        data: { tab: '2', order: '1', offset: 0, exclude_article_ids: '' }
      });
      return isSuccess && Array.isArray(data?.data?.rows) ? data.data.rows.slice(0, 20) : [];
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

  // ִ�е�������
  async doRatingTask(task) {
    this.$env.log(`��ʼ����: ${task.task_name}`);

    let article;

    if (task.task_description.indexOf('����') >= 0 || task.task_redirect_url.link_val == '0' || !task.task_redirect_url.link_val) {
      // ���ѡһƪ����
      const articles = await this.getArticleList(20);

      if (articles.length < 1) {
        return {
          isSuccess: false
        };
      }

      article = this.getOneByRandom(articles);
    }
    else if (task.task_redirect_url.link_type === 'lanmu') {
      // ����Ŀ��ȡ����
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
      this.$env.log('��δ֧��');

      return {
        isSuccess: false
      };
    }

    await wait(3, 10);

    if (article.article_price) {
      // ��ֵ
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
      // ����
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

    this.$env.log('��ȡ����');
    await wait(5, 15);

    return await this.receiveReward(task.task_id);
  }

  // ִ���ղ�����
  async doFavoriteTask(task) {
    this.$env.log(`��ʼ����: ${task.task_name}`);

    let articleId = '';
    let channelId = '';

    if (task.task_redirect_url.link_type === 'lanmu') {
      // ����Ŀ��ȡ����
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
      // �� Tag ��ȡ����
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
      // ���ѡһƪ����
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

      // ��ȡ������Ϣ
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

    this.$env.log('��ȡ����');
    await wait(5, 15);

    return await this.receiveReward(task.task_id);
  }

  // ִ�й�ע�û�����
  async doFollowUserTask(task) {
    this.$env.log(`��ʼ����: ${task.task_name}`);

    // ���ѡһ���û�
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

    this.$env.log('��ȡ����');
    await wait(5, 15);

    return await this.receiveReward(task.task_id);
  }

  // ִ�й�ע��Ŀ������ȡ�أ��ٹ�ע�����ȡ�أ�
  async doFollowTagTask(task) {
    this.$env.log(`��ʼ����: ${task.task_name}`);

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

    // ��ȡ��Ŀ��Ϣ
    const tagDetail = await this.getTagDetail(lanmuId);

    if (!tagDetail.lanmu_id) {
      this.$env.log('��ȡ��Ŀ��Ϣʧ�ܣ�');

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

    this.$env.log('��ȡ����');
    await wait(5, 15);

    return await this.receiveReward(task.task_id);
  }

  // ִ�й�עƷ��������ȡ�أ��ٹ�ע�����ȡ�أ�
  async doFollowBrandTask(task) {
    this.$env.log(`��ʼ����: ${task.task_name}`);

    // ��ȡƷ����Ϣ
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

    this.$env.log('��ȡ����');
    await wait(5, 15);

    return await this.receiveReward(task.task_id);
  }

  // ִ�г齱����
  async doCrowdTask(task) {
    this.$env.log(`��ʼ����: ${task.task_name}`);

    let { isSuccess, data } = await this.getCrowd('���', 0);

    if (!isSuccess) {
      if (process.env.SMZDM_CROWD_SILVER_5 == 'yes') {
        ({ isSuccess, data } = await this.getCrowd('5������', 5));

        if (!isSuccess) {
          return {
            isSuccess,
            code: 99
          };
        }
      }
      else {
        this.$env.log('??������ SMZDM_CROWD_SILVER_5 ��������ֵΪ yes ����ܽ���5�����ӳ齱��');

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

    this.$env.log('��ȡ����');
    await wait(5, 15);

    return await this.receiveReward(task.task_id);
  }

  // ִ�����·�������
  async doShareTask(task) {
    this.$env.log(`��ʼ����: ${task.task_name}`);

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
      this.$env.log(`��ʼ������ ${i + 1} ƪ����...`);

      const article = articles[i];

      if (task.task_redirect_url.link_type != 'other') {
        // ģ�������
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

    this.$env.log('��ȡ����');
    await wait(3, 10);

    return await this.receiveReward(task.task_id);
  }

  // ִ���������
  async doViewTask(task) {
    this.$env.log(`��ʼ����: ${task.task_name}`);

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
      this.$env.log(`��ʼ�Ķ��� ${i + 1} ƪ����...`);

      const article = articles[i];

      if (isRead) {
        // ģ�������
        if (/detail_haojia/i.test(task.task_redirect_url.scheme_url)) {
          await this.getHaojiaDetail(article.article_id);
        }
        else {
          await this.getArticleDetail(article.article_id);
        }
      }

      this.$env.log('ģ���Ķ�����');
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
        this.$env.log('����Ķ��ɹ���');
      }
      else {
        this.$env.log(`����Ķ�ʧ�ܣ�${response}`);
      }

      await wait(5, 15);
    }

    this.$env.log('��ȡ����');
    await wait(3, 10);

    return await this.receiveReward(task.task_id);
  }

  // ��ע/ȡ��
  async follow({keywordId, keyword, type, method}) {
    let touchstone = '';

    if (type === 'user') {
      touchstone = this.getTouchstoneEvent({
        event_value: {
          cid: 'null',
          is_detail: false,
          p: '1'
        },
        sourceMode: '�ҵ�_�ҵ�����ҳ',
        sourcePage: 'Android/��ע/����/���ϰ�',
        upperLevel_url: '��ע/����/�Ƽ�/'
      });
    }
    else if (type === 'tag') {
      touchstone = this.getTouchstoneEvent({
        event_value: {
          cid: 'null',
          is_detail: false
        },
        sourceMode: '��Ŀҳ',
        sourcePage: `Android/��Ŀҳ/${keyword}/${keywordId}/`,
        source_page_type_id: String(keywordId),
        upperLevel_url: '��������/׬����/',
        source_area: {
          lanmu_id: String(keywordId),
          prev_source_scence: '�ҵ�_�ҵ�����ҳ'
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
      this.$env.log(`${method} ��ע�ɹ�: ${keyword}`);
    }
    else {
      this.$env.log(`${method} ��עʧ�ܣ�${response}`);
    }

    return {
      isSuccess,
      response
    };
  }

  // �����ȡ�û�
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
      this.$env.log(`��ȡ�û��б�ʧ�ܣ�${response}`);

      return false;
    }
  }

  // �μӳ齱
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
        sourceRoot: '��������',
        sourceMode: '�����ݳ齱',
        price_id: 1
      }
    });

    if (isSuccess) {
      this.$env.log(removeTags(data.data.msg));
    }
    else {
      this.$env.log(`�μ���ѳ齱ʧ��: ${response}`);
    }

    return {
      isSuccess,
      response
    };
  }

  // ��ȡ�齱��Ϣ
  async getCrowd(name, price) {
    const { isSuccess, data, response } = await requestApi('https://zhiyou.smzdm.com/user/crowd/', {
      sign: false,
      parseJSON: false,
      headers: this.getHeadersForWeb()
    });

    const re = new RegExp(`<button\\s+([^>]+?)>\\s+?<div\\s+[^>]+?>\\s*${name}(?:�齱)?\\s*<\\/div>\\s+<span\\s+class="reduceNumber">-${price}<\\/span>[\\s\\S]+?<\\/button>`, 'ig');

    if (isSuccess) {
      const crowds = [];
      let match;

      while ((match = re.exec(data)) !== null) {
        crowds.push(match[1]);
      }

      if (crowds.length < 1) {
        this.$env.log(`δ�ҵ�${name}�齱`);

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
          this.$env.log('δ�ҵ����Ϲؼ��ʵĳ齱��ִ�����ѡȡ');
          crowd = this.getOneByRandom(crowds);
        }
      }
      else {
        crowd = this.getOneByRandom(crowds);
      }

      const matchCrowd = crowd.match(/data-crowd_id="(\d+)"/i);

      if (matchCrowd) {
        this.$env.log(`${name}�齱ID: ${matchCrowd[1]}`);

        return {
          isSuccess: true,
          data: matchCrowd[1]
        };
      }
      else {
        this.$env.log(`δ�ҵ�${name}�齱ID`);

        return {
          isSuccess: false
        };
      }
    }
    else {
      this.$env.log(`��ȡ${name}�齱ʧ��: ${response}`);

      return {
        isSuccess: false
      };
    }
  }

  // �������
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
      this.$env.log('��ɷ����ɹ���');

      return {
        isSuccess,
        msg: '��ɷ����ɹ���'
      };
    }
    else {
      this.$env.log(`��ɷ���ʧ�ܣ�${response}`);

      return {
        isSuccess: false,
        msg: '��ɷ���ʧ�ܣ�'
      };
    }
  }

  // ������ɺ�ص��ӿ�
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
            pid: '��'
          },
          sourceMode: '���а�_����_���ľ�ѡ',
          sourcePage: `Android/��ͼ��/P/${articleId}/`,
          upperLevel_url: '���а�/����/���ľ�ѡ/����_24H/'
        })
      }
    });

    if (isSuccess) {
      this.$env.log('�����ص���ɡ�');

      return {
        isSuccess,
        msg: ''
      };
    }
    else {
      this.$env.log(`�����ص�ʧ�ܣ�${response}`);

      return {
        isSuccess,
        msg: '�����ص�ʧ�ܣ�'
      };
    }
  }

  // ������ÿ�ս�����ò��ûɶ�ã�
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
        this.$env.log(`����ÿ�ս�������ʧ�ܣ�${response}`);

        return {
          isSuccess,
          msg: '����ÿ�ս�������ʧ�ܣ�'
        };
      }
    }
  }

  // ��ȡ�����б�
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
      // ȡǰ num ��������
      return data.data.rows.slice(0, num);
    }
    else {
      this.$env.log(`��ȡ�����б�ʧ��: ${response}`);
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
      this.$env.log(`Robot Token ��ȡʧ�ܣ�${response}`);

      return false;
    }
  }

  // ��ȡ��Ŀ��Ϣ
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
      this.$env.log(`��ȡ��Ŀ��Ϣʧ�ܣ�${response}`);

      return {};
    }
  }

  // ��ȡ��Ŀ�б�
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
      this.$env.log(`��ȡ��Ŀ�б�ʧ�ܣ�${response}`);

      return false;
    }
  }

  // ��ȡ��������
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
      this.$env.log(`��ȡ��������ʧ�ܣ�${response}`);

      return false;
    }
  }

  // ��ȡ�ü�����
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
      this.$env.log(`��ȡ�ü�����ʧ�ܣ�${response}`);

      return false;
    }
  }

  // �ղ�
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
          sourceMode: '�ҵ�_�ҵ�����ҳ',
          sourcePage: `Android/��ͼ��/P/${id}/`,
          upperLevel_url: '��������/׬����/'
        }),
        token: this.token,
        id,
        channel_id: channelId
      }
    });

    if (isSuccess) {
      this.$env.log(`${method} �ղسɹ�: ${id}`);
    }
    else {
      this.$env.log(`${method} �ղ�ʧ�ܣ�${response}`);
    }

    return {
      isSuccess,
      response
    };
  }

  getTouchstoneEvent(obj) {
    const defaultObj = {
      search_tv: 'f',
      sourceRoot: '��������',
      trafic_version: '113_a,115_b,116_e,118_b,131_b,132_b,134_b,136_b,139_a,144_a,150_b,153_a,179_a,183_b,185_b,188_b,189_b,193_a,196_b,201_a,204_a,205_a,208_b,222_b,226_a,228_a,22_b,230_b,232_b,239_b,254_a,255_b,256_b,258_b,260_b,265_a,267_a,269_a,270_c,273_b,276_a,278_a,27_a,280_a,281_a,283_b,286_a,287_a,290_a,291_b,295_a,302_a,306_b,308_b,312_b,314_a,317_a,318_a,322_b,325_a,326_a,329_b,32_c,332_b,337_c,341_a,347_a,349_b,34_a,351_a,353_b,355_a,357_b,366_b,373_B,376_b,378_b,380_b,388_b,391_b,401_d,403_b,405_b,407_b,416_a,421_a,424_b,425_b,427_a,436_b,43_j,440_a,442_a,444_b,448_a,450_b,451_b,454_b,455_a,458_c,460_a,463_c,464_b,466_b,467_b,46_a,470_b,471_b,474_b,475_a,484_b,489_a,494_b,496_b,498_a,500_a,503_b,507_b,510_bb,512_b,515_a,520_a,522_b,525_c,527_b,528_a,59_a,65_b,85_b,102_b,103_a,106_b,107_b,10_f,11_b,120_a,143_b,157_g,158_c,159_c,160_f,161_d,162_e,163_a,164_a,165_a,166_f,171_a,174_a,175_e,176_d,209_b,225_a,235_a,236_b,237_c,272_b,296_c,2_f,309_a,315_b,334_a,335_d,339_b,346_b,361_b,362_d,367_b,368_a,369_e,374_b,381_c,382_b,383_d,385_b,386_c,389_i,38_b,390_d,396_a,398_b,3_a,413_a,417_a,418_c,419_b,420_b,422_e,428_a,430_a,431_d,432_e,433_a,437_b,438_c,478_b,479_b,47_a,480_a,481_b,482_a,483_a,488_b,491_j,492_j,504_b,505_a,514_a,518_b,52_d,53_d,54_v,55_z1,56_z3,66_a,67_i,68_a1,69_i,74_i,77_d,93_a',
      tv: 'z1'
    };

    return JSON.stringify({...defaultObj, ...obj});
  }

  // ��עƷ��
  async followBrand({keywordId, keyword, method}) {
    const touchstone = this.getTouchstoneEvent({
      event_value: {
        cid: '44',
        is_detail: true,
        aid: String(keywordId)
      },
      sourceMode: '�ٿ�_Ʒ������ҳ',
      sourcePage: `Android/����/Ʒ������ҳ/${keyword}/${keywordId}/`,
      upperLevel_url: '��������/׬����/'
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
        refer: `Android/����/Ʒ������ҳ/${keyword}/${keywordId}/`,
        touchstone_event: touchstone
      }
    });

    if (isSuccess) {
      this.$env.log(`${method} ��ע�ɹ�: ${keyword}`);
    }
    else {
      this.$env.log(`${method} ��עʧ�ܣ�${response}`);
    }

    return {
      isSuccess,
      response
    };
  }

  // ��ȡƷ����Ϣ
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
      this.$env.log(`��ȡƷ����Ϣʧ�ܣ�${response}`);

      return {};
    }
  }

  // ������Ŀ��Ϣ��ȡ�����б�
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
      // ȡǰ num ��������
      return data.data.rows.slice(0, num);
    }
    else {
      this.$env.log(`��ȡ�����б�ʧ��: ${response}`);
      return [];
    }
  }

  // ����
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
          sourceMode: '��Ŀҳ',
          sourcePage: `Android//P/${id}/`,
          upperLevel_url: '��Ŀҳ///'
        }),
        token: this.token,
        id,
        channel_id: channelId,
        wtype: type
      }
    });

    if (isSuccess) {
      this.$env.log(`${method} ���޳ɹ�: ${id}`);
    }
    else {
      this.$env.log(`${method} ����ʧ�ܣ�${response}`);
    }

    return {
      isSuccess,
      response
    };
  }

  // ��������
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
          sourceMode: '��������_ȫ��',
          sourcePage: `Android/��ͼ��/${articleId}/����ҳ/`,
          upperLevel_url: '��������/��ҳ/ȫ��/',
          sourceRoot: '����'
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
      this.$env.log(`���۷����ɹ�: ${data.data.comment_ID}`);
    }
    else {
      this.$env.log(`���۷���ʧ�ܣ�${response}`);
    }

    return {
      isSuccess,
      data,
      response
    };
  }

  // ɾ������
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
      this.$env.log(`����ɾ���ɹ�: ${id}`);
    }
    else {
      this.$env.log(`����ɾ��ʧ�ܣ�${response}`);
    }

    return {
      isSuccess,
      response
    };
  }

  // ��ȡ Dingyue ״̬
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
      this.$env.log(`��ȡ����״̬ʧ��: ${response}`);
      return {};
    }
  }

  // ���� Tag ID ��ȡ�����б�
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
      // ȡǰ num ��������
      return data.data.rows.slice(0, num);
    }
    else {
      this.$env.log(`��ȡ�����б�ʧ��: ${response}`);
      return [];
    }
  }

  // ͨ�� url ��ȡ���� channel_id
  async getArticleChannelIdForTesting(url) {
    const { isSuccess, response } = await requestApi(url, {
      method: 'get',
      headers: this.getHeaders(),
      parseJSON: false,
      sign: false
    });

    if (!isSuccess) {
      this.$env.log(`��ȡ������Ϣʧ�ܣ�${response}`);

      return false;
    }

    // ͨ��������ȡҳ���е� channel_id
    const re = /'channel_id'\s*:\s*'(\d+)'/;
    const matchRet = response.match(re);

    if (!matchRet) {
      this.$env.log(`��ȡ������Ϣʧ�ܣ�${response}`);

      return false;
    }

    return matchRet[1];
  }
}

module.exports = {
  SmzdmTaskBot
};
