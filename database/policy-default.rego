package authz.user

# 不额外放通任何请求，完全依赖平台默认策略。
# 用于验证：HTTP 访问服务（enableAuth=false）是否本身就无需用户策略放通。
default allow := false
