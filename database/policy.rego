package authz.user

default allow := false

# ---------------------------------------------------------------------------
# 健康证 H5 环境 — OPA 授权策略
#
# 背景：CloudBase PostgreSQL 体验版不支持「身份认证 → 权限控制」页面
#      （显示"当前环境暂不支持此功能"），因此前端 js-sdk 的 callFunction
#       会返回 EXCEED_AUTHORITY。
#       本环境所有云端调用均走「HTTP 访问服务」，该通道不需要登录态。
#
# 本策略仅作为网关层的兜底最小放通，不放行任何管理类接口。
#   /api         → health-cert-verify  扫码查验（公开只读）
#   /api/create  → health-cert-create  健康证签发（录入页提交）
#
# health-cert-cleanup 由定时触发器在服务端调用，不经过网关，无需放通。
# ---------------------------------------------------------------------------

# 放通「扫码查验」接口（匿名 / 未登录均可，业务本身公开）
allow if {
  input.cloudbase.resource_type == "functions"
  contains(input.request.path, "/api")
  not contains(input.request.path, "create")
}

# 放通「健康证签发」接口
allow if {
  input.cloudbase.resource_type == "functions"
  contains(input.request.path, "/api/create")
}
