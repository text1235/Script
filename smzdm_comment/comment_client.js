const { SmzdmBot, requestApi, wait } = require('./comment_bot');
class SmzdmCommentClient extends SmzdmBot {
  constructor(cookie, env) { super(cookie); this.$env = env; }
  async getArticleDetail(id) {
    const { isSuccess, data, response } = await requestApi(`https://article-api.smzdm.com/article_detail/${id}`, {
      headers: this.getHeaders(),
      data: {
        comment_flow: '',
        lastest_update_time: '',
        uhome: 0,
        imgmode: 0,
        article_channel_id: 0
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

  async getTagDetail(id) {
    const { isSuccess, data, response } = await requestApi('https://app-api.smzdm.com/common/config_data', {
      headers: this.getHeaders(),
      data: {
        id,
        type: 'lanmu',
        calendar_time: '',
        token: this.token
      }
    });

    if (isSuccess) {
      return data.data;
    }
    else {
      this.$env.log(`获取栏目信息失败: ${response}`);

      return {};
    }
  }

  async getArticleListFromLanmu(id, num = 1) {
    const lanmuDetail = await this.getTagDetail(id);

    if (!lanmuDetail.keyword_id) {
      return [];
    }

    const tabParams = lanmuDetail.tab && lanmuDetail.tab[0] ? lanmuDetail.tab[0].params : '';

    const { isSuccess, data, response } = await requestApi('https://app-api.smzdm.com/common/list_data', {
      headers: this.getHeaders(),
      data: {
        params: lanmuDetail.params,
        tab_params: tabParams,
        page: 1,
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

  getTouchstoneEvent(obj) {
    const defaultObj = {
      search_tv: 'f',
      sourceRoot: '个人中心',
      trafic_version: '113_a,115_b,116_e,118_b,131_b,132_b,134_b,136_b,139_a,144_a,150_b,153_a,179_a,183_b,185_b,188_b,189_b,193_a,196_b,201_a,204_a,205_a,208_b,222_b,226_a,228_a,22_b,230_b,232_b,239_b,254_a,255_b,256_b,258_b,260_b,265_a,267_a,269_a,270_c,273_b,276_a,278_a,27_a,280_a,281_a,283_b,286_a,287_a,290_a,291_b,295_a,302_a,306_b,308_b,312_b,314_a,317_a,318_a,322_b,325_a,326_a,329_b,32_c,332_b,337_c,341_a,347_a,349_b,34_a,351_a,353_b,355_a,357_b,366_b,373_B,376_b,378_b,380_b,388_b,391_b,401_d,403_b,405_b,407_b,416_a,421_a,424_b,425_b,427_a,436_b,43_j,440_a,442_a,444_b,448_a,450_b,451_b,454_b,455_a,458_c,460_a,463_c,464_b,466_b,467_b,46_a,470_b,471_b,474_b,475_a,484_b,489_a,494_b,496_b,498_a,500_a,503_b,507_b,510_bb,512_b,515_a,520_a,522_b,525_c,527_b,528_a,59_a,65_b,85_b,102_b,103_a,106_b,107_b,10_f,11_b,120_a,143_b,157_g,158_c,159_c,160_f,161_d,162_e,163_a,164_a,165_a,166_f,171_a,174_a,175_e,176_d,209_b,225_a,235_a,236_b,237_c,272_b,296_c,2_f,309_a,315_b,334_a,335_d,339_b,346_b,361_b,362_d,367_b,368_a,369_e,374_b,381_c,382_b,383_d,385_b,386_c,389_i,38_b,390_d,396_a,398_b,3_a,413_a,417_a,418_c,419_b,420_b,422_e,428_a,430_a,431_d,432_e,433_a,437_b,438_c,478_b,479_b,47_a,480_a,481_b,482_a,483_a,488_b,491_j,492_j,504_b,505_a,514_a,518_b,52_d,53_d,54_v,55_z1,56_z3,66_a,67_i,68_a1,69_i,74_i,77_d,93_a',
      tv: 'z1'
    };

    return JSON.stringify({...defaultObj, ...obj});
  }

  async submitComment({ articleId, channelId, content }) {
    const { isSuccess, data, response } = await requestApi('https://comment-api.smzdm.com/comments/submit', {
      method: 'post',
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

  request(url, options = {}) {
    return requestApi(url, { ...options, headers: this.getHeaders() });
  }

  async getCommentTask(id) {
    const r = await this.request('https://user-api.smzdm.com/task/list_v2', { method: 'post' });
    if (!r.isSuccess) return null;
    const tasks = (r.data?.data?.rows || []).flatMap(row =>
      (row.cell_data?.activity_task?.default_list_v2 || []).flatMap(group => group.task_list || []));
    const matches = tasks.filter(task => task.task_id === id && task.task_event_type === 'interactive.comment');
    return matches.length === 1 ? matches[0] : null;
  }

  async receiveCommentReward(id) {
    const token = await this.request('https://user-api.smzdm.com/robot/token', { method: 'post' });
    if (!token.isSuccess || !token.data?.data?.token) return { isSuccess: false };
    return await this.request('https://user-api.smzdm.com/task/activity_task_receive', {
      method: 'post', data: { robot_token: token.data.data.token, geetest_seccode: '', geetest_validate: '',
        geetest_challenge: '', captcha: '', task_id: id }
    });
  }

  buildCommentContent(detail, variant = 0) {
    const title = String(detail.article_title || '');
    const rules = [
      [/回音壁|后环绕/, [
        '后环绕的摆位很值得提前规划。想请教一下，沙发靠墙时放在两侧是否合适，还是需要留出后方距离？',
        '想进一步了解夜间使用的表现。低音炮音量调低后，对白清晰度和环绕效果是否还能兼顾？',
        '对连接方式还有一点疑问：电视的音频格式和接口限制，哪些情况最容易影响这套回音壁的效果？'
      ]],
      [/磁轴|键盘/, [
        '办公和游戏兼顾的思路挺实用。想问一下，打字和游戏的触发参数能否分别保存，切换时需要一直开驱动吗？',
        '数字区对做表格比较有用。想进一步了解长时间输入时的大键手感，以及误触参数是否容易调整。',
        '想请教一下，换到另一台电脑后原来的键位和触发配置能否保留，还是需要重新设置？'
      ]],
      [/发错货|发来.*无人机|跳绳.*无人机/, [
        '发现发错货后先在平台内联系卖家，这个处理方式很稳妥。退回前把运费承担方式确认清楚，也能减少后续争议。',
        '开箱录像这个提醒很实用，低价物品也不能省掉留证据。遇到发错货，聊天记录和退回快递凭证都值得保存。',
        '不脱离平台沟通和退货很关键。即使收到的东西看起来更贵，也应该先核对订单、联系卖家并留下处理记录。'
      ]]
    ];
    const match = rules.find(([pattern]) => pattern.test(title));
    return match ? match[1][variant % match[1].length] : '';
  }

  async getPublicCommentVisibility(articleId, commentId) {
    if (!/^[a-zA-Z0-9]+$/.test(articleId) || !/^\d+$/.test(commentId)) return null;
    const got = require('got');
    try {
      const response = await got(`https://post.smzdm.com/p/${articleId}/?reply_comment_id=${commentId}&sort_tab=new`, {
        retry: { limit: 0 }, timeout: { request: 15000 }
      });
      const tag = response.body.match(new RegExp('<[^>]+data-comment-id=["\x27]' + commentId + '["\x27][^>]*>'));
      const raw = tag?.[0].match(/data-comment-info='([^']*)'/)?.[1];
      return raw ? JSON.parse(raw).is_visible : null;
    }
    catch (error) { return null; }
  }

  async completeTask(task, owner, options = {}) {
    const fs = require('fs'), path = require('path'), crypto = require('crypto');
    const identity = this.cookie.match(/(?:^|;\s*)smzdm_id=([^;]+)/)?.[1] || this.token;
    const key = crypto.createHash('sha256').update(identity).digest('hex').slice(0, 16);
    const root = '/ql/data/.smzdm-comment';
    fs.mkdirSync(root, { recursive: true, mode: 0o700 });
    const file = path.join(root, key + '.json'), lock = file + '.lock';
    let fd;
    try { fd = fs.openSync(lock, 'wx', 0o600); }
    catch (error) { return { isSuccess: false, reason: '已有评论操作或未收尾锁，停止重复提交' }; }
    const lockToken = crypto.randomBytes(12).toString('hex');
    const cleanup = () => {
      if (!fs.existsSync(lock)) return;
      try { if (JSON.parse(fs.readFileSync(lock, 'utf8')).token === lockToken) fs.unlinkSync(lock); } catch (error) {}
    };
    try { fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, token: lockToken, started_at: new Date().toISOString(), task: 'smzdm-comment' })); }
    catch (error) { cleanup(); throw error; }
    finally { fs.closeSync(fd); }
    process.once('exit', cleanup);
    const onTerminate = () => { cleanup(); process.exit(143); };
    process.once('SIGTERM', onTerminate);
    const day = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Shanghai' });
    let state = { day, attempts: 0 };
    const save = () => { const temp = file + '.tmp'; fs.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 }); fs.renameSync(temp, file); };
    const stop = reason => { state.blocked = reason; save(); return { isSuccess: false, reason }; };
    try {
      if (fs.existsSync(file)) state = JSON.parse(fs.readFileSync(file, 'utf8'));
      const maxAttempts = options.maxAttempts === undefined ? 3 : Number(options.maxAttempts);
      if (!Number.isInteger(maxAttempts) || maxAttempts < 3 || maxAttempts > 6) return stop('本次评论测试预算无效');
      let current = await this.getCommentTask(task.task_id);
      const target = Number(current?.task_even_num);
      let count = Number(current?.task_finished_num);
      if (!current || !Number.isInteger(target) || target < 1 || target > 3 ||
          !Number.isInteger(count) || count < 0 || count > target) return stop('任务进度无法核实，停止发布');
      const received = value => String(value?.is_received) === '1' && ['1', '4'].includes(String(value?.task_status));
      if (state.pending) {
        if (state.pending.kind === 'reward' && state.pending.task_id === current.task_id && received(current)) { state.pending = null; save(); }
        else return stop('上次请求结果未知，保留记录并停止重复提交');
      }
      if (state.awaitingCount) {
        if (state.day === day && state.awaitingCount.task_id === current.task_id && count > state.awaitingCount.before) { state.awaitingCount = null; state.blocked = null; save(); }
        else if (options.reconcileSelfVisible?.comment_id === state.awaitingCount.comment_id &&
            await this.getPublicCommentVisibility(options.reconcileSelfVisible.article_id, state.awaitingCount.comment_id) === 1) {
          state.reconciled = { ...state.awaitingCount, outcome: 'confirmed_self_visible_not_credited', checked_at: new Date().toISOString() };
          state.awaitingCount = null; state.blocked = null; save();
        }
        else if (options.retainUncredited?.comment_id === state.awaitingCount.comment_id && state.day === day &&
            state.attempts < maxAttempts && Array.isArray(options.articles) && options.articles.length &&
            options.articles.every(article => String(article.article_id) !== options.retainUncredited.article_id)) {
          state.uncreditedComments = [...(state.uncreditedComments || []), { ...state.awaitingCount,
            article_id: options.retainUncredited.article_id, task_id: task.task_id, outcome: 'accepted_id_but_credit_unconfirmed',
            retained_at: new Date().toISOString() }];
          state.awaitingCount = null; state.blocked = null; save();
        }
        else return stop('上次评论已发布但未确认计入，保留评论并停止重复提交');
      }
      if (state.day !== day) { state = { day, attempts: 0, uncreditedComments: state.uncreditedComments || [], postedKeys: state.postedKeys || [] }; save(); }
      const claim = async () => {
        if (received(current)) return { isSuccess: true, reason: `评论已核实 ${count}/${target}，奖励已领取` };
        if (current.task_status !== '3') return stop(`评论已核实 ${count}/${target}，奖励状态尚不可领取`);
        state.pending = { kind: 'reward', task_id: task.task_id, started_at: new Date().toISOString() }; save();
        const reward = await this.receiveCommentReward(task.task_id);
        if (!reward.isSuccess) {
          if (reward.data?.error_code !== undefined && String(reward.data.error_code) !== '0') { state.pending = null; save(); }
          return stop('评论已完成，奖励领取未确认');
        }
        state.pending = null; save();
        const verified = await this.getCommentTask(task.task_id);
        return { isSuccess: received(verified) && Number(verified?.task_finished_num) === target,
          reason: `评论已核实 ${count}/${target}；${String(reward.data?.data?.reward_msg || '').replace(/<[^>]+>/g, '')}` };
      };
      if (count === target) return await claim();
      if (current.task_status !== '2') return stop('任务当前不可执行');
      if (state.blocked) return { isSuccess: false, reason: state.blocked };
      const overrides = options.articles;
      const automatic = process.env.SMZDM_COMMENT_AUTO === 'true' && !overrides;
      const scope = owner.commentTaskScope(current, overrides?.[0]?.content || (automatic ? '' : process.env.SMZDM_COMMENT || ''));
      if (scope.kind === 'blocked') return stop(scope.reason);
      if (overrides && scope.kind !== 'general') return stop('指定范围任务不能使用普通文章测试列表');
      const articles = overrides || await owner.getCommentArticles(scope);
      if (!Array.isArray(articles) || !articles.length) return stop('未找到已核对的目标文章');
      const scopeKey = value => JSON.stringify([value.kind, value.id || '', value.channelId || '']);
      const remaining = target - count;
      let cursor = 0;
      for (let index = 0; index < remaining; index++) {
        if ((overrides || !automatic) && index >= articles.length) return stop('已核对的不同评论文案数量不足');
        let article, id, detail, content;
        for (let checked = 0; checked < articles.length; checked++) {
          article = articles[cursor++ % articles.length]; id = String(article.article_id || article.id || '');
          detail = await this.getArticleDetail(id);
          if (!detail || String(detail.article_id) !== id) continue;
          if (scope.kind === 'general' && /评论有奖|抽奖|赢现金|有奖活动/.test(detail.article_title || '')) continue;
          content = String(article.content || (automatic ? this.buildCommentContent(detail, parseInt(key.slice(0, 4), 16) + index) : process.env.SMZDM_COMMENT || ''));
          if ((state.postedKeys || []).includes(crypto.createHash('sha256').update(id + '\n' + content).digest('hex'))) { content = ''; continue; }
          if (content.length > 10) break;
        }
        if (!content || content.length <= 10) return stop('没有能匹配正文的评论文案，停止发布');
        if (scopeKey(owner.commentTaskScope(current, content)) !== scopeKey(scope)) return stop('评论文案与任务范围未匹配');
        if (state.attempts >= maxAttempts) return stop('已达到本账号今日评论提交上限');
        const channelId = detail.channel_id || article.article_channel_id;
        if (!channelId) return stop('文章频道无法核实');
        await wait(3, 10);
        const fresh = await this.getCommentTask(task.task_id), freshCount = Number(fresh?.task_finished_num);
        if (!fresh || fresh.task_id !== task.task_id || Number(fresh.task_even_num) !== target ||
            !Number.isInteger(freshCount) || freshCount < count || freshCount > target ||
            scopeKey(owner.commentTaskScope(fresh, content)) !== scopeKey(scope)) return stop('提交前任务进度或范围变化，停止发布');
        current = fresh; count = freshCount;
        if (count === target) return await claim();
        if (current.task_status !== '2') return stop('提交前任务已不可执行，停止发布');
        state.attempts++; state.pending = { kind: 'comment', article_id: id, before: count, started_at: new Date().toISOString() }; save();
        const posted = await this.submitComment({ articleId: id, channelId, content });
        if (!posted.isSuccess || !posted.data?.data?.comment_ID) {
          if (posted.data?.error_code !== undefined && String(posted.data.error_code) !== '0') { state.pending = null; save(); }
          return stop('评论提交失败或结果未知，不自动重试');
        }
        state.pending = null; state.postedKeys = [...(state.postedKeys || []), crypto.createHash('sha256').update(id + '\n' + content).digest('hex')];
        state.awaitingCount = { task_id: task.task_id, scope_key: scopeKey(scope), article_id: id, before: count, comment_id: String(posted.data.data.comment_ID) }; save();
        for (let attempt = 0; attempt < 3; attempt++) {
          await wait(20, 30);
          current = await this.getCommentTask(task.task_id);
          const next = Number(current?.task_finished_num);
          if (!current || Number(current.task_even_num) !== target || scopeKey(owner.commentTaskScope(current, content)) !== scopeKey(scope)) return stop('评论任务范围变化，停止发布');
          if (Number.isInteger(next) && next > count && next <= target) { count = next; break; }
        }
        if (count <= state.awaitingCount.before) return stop(`评论已发布但计数未增长，当前 ${count}/${target}；可能自见或待审核，停止继续发布`);
        state.awaitingCount = null; save(); this.$env.log(`评论任务已核实 ${count}/${target}`);
        if (count === target) return await claim();
      }
      return stop(`评论进度 ${count}/${target}，尚未完成`);
    }
    finally { cleanup(); process.removeListener('exit', cleanup); process.removeListener('SIGTERM', onTerminate); }
  }
}
module.exports = { SmzdmCommentClient };
