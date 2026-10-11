import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { jsPDF } from "jspdf";
//#region src/assets/bulletin_state.png?inline
var bulletin_state_default = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAARAAAADuCAIAAAB+h8+fAAAACXBIWXMAAC4jAAAuIwF4pT92AAAn4ElEQVR4nO2dd1xUV9rHTTZ1825iiilufLN5N9nsbkx2N9XEZFOMcWPsosHYjS3SFBCwF1CIYsOCYoMoEZWgdI2iotgAC71I79LbDNPvey7jEjL33GHuzDn33BnO9/P8oyLnOeV3T39OH4ZCoZhMH9IOUCjWBBUMhSIAKhgKRQBUMBSKAKhgKBQBUMFQKAKggqFQBEAFQ6EIgAqGQhEAFQyFIgAqGApFAFQwFIoAqGAoFAFQwVAoAqCCoVAEQAVDoQiACoZCEQAVDIUiACoYCkUAVDAUigCoYCgUAVDBUCgCoIKhUARABUOhCIAKhkIRABUMhSIAKhgKRQBUMBSKAKhgKBQBUMFQKAKggqFQBEAFQ6EIgAqGQhEAFYx4qDTq8sa6a0W5J9Ou7bgQuzzq8MLj++aE7rDb6wdsyLYV3W307nXgL2f8uM0hbLfnieAtCZE/pSRevJOZf7dSplSQzkrvhQoGC3KlIrOy9HDyBaCKyQc3vb/B/TnPaX0WjEJlj7vav+7tOC7I1+X43j2XTiUVZDfK2khnuldABYMGhUp1vTgP9BvTQ7b+3dvhfocxCOVhov1x6cxRgT7ecUdPZd2ob2shXSS2CRWM+QCRJOSmLY089NnWZQ85jxNfIcZtoI/TvJ92Hk29VNPSRLqobAcqGMGUNdbuTIwdtn3VIy52xFVhit3nMPot30VLIn8EfaBOpyNdftYNFYypZFeXrYs/9re1DsQFYIn185g6/8iuMzm31BoN6RK1SqhgeqCwrnptXNhf1yzA1IKfcJv04tJZL6+Y8+rq+aAf0BuYBYG/AdbXbdLvHLFMh550/3bWoYDE/EytVku6jK0JKhg4cqXi4NWzH/p7WN40QYt/3dtx+M41jkf3bDsXFXHrytnc2xmVJXVtLWAW1KMnoEE3ytry71aCxh2TkRKUdHpZ1KExe9a/t8H9D67fWO4ekOuK6NDShloRStUGoIIxJKuqdEFY4OOu9mY3QdAdgQbtezo8Oj0ZNESsn/CG9tbzeem7L8VPD9n6/gb3h53Hm+fz/Q5jvtq5JjLtOu1wjEMFcw/QUOIyU4dsW2FGa3vIedzHm73WxB6Jz7rRLG8nmAuVRg1m9gHno+32+j29eLIZeQHjQPDfW+QygrmQMlQwDJj+Bl9N+Mvq+ULb1j/Xu3ieCE7ITTNlZCU+Op0O9JabE04ODVgpdEEPDPYWRxykmzlcerVgQEMHg5n/Xf6d6S0JTEi+3L4K/K/i+hrS7gugTSEHcycwywdzfdMzC2QG5l2VTQ2k3ZcQvVQwoFc5cOWM6VIBQ/xPtywFOqmz8o8uGLPFZqRMDd5s+iQNzIvcIw5Ye8ZR0RsFE5V+/c8r55rYXAYsm7U2Lqyozpr6E1NoV3QcvHr2o01eJpbDYwsn+sQflff6c5+9SzA3ywr/vXmJiV3KqEAfMIm3+VWj7Ooyt58P9HWbZEqx9F8y43DyBZsvEyP0FsE0ydrmhO4wZRMQfEpdju8tqb9L2mVRkSkVuxLjTOx4B21cnFZRTNplMti+YMDncN/lX0w5Xf/HpTO3novqzSuqGq3mVNYNU7ZrwadnQVhgU++7U2DjgsmrqTBlawXIaUtCZIdKSdpfqRCXmfr+BndTPjEn066RdlZUbFYwOp0OaACMr4xX+VOLJ/ufPSHNjRTigN7mH+tcepSN/f6NvWfHxjYFU1RX0+PkHmjJ80Rwbx6AmQIY0IYmX3h5xRzjhdnPY2p0ejJpZ8XABgVzOPlCj5sM4KPY26b1liBXKtafOt5jqc4N3Wnz8QZsSjBtCvnU4M3GK/WVVfPO5t4m7alVUtnUMC7I13jxvu7tmF1dRtpTjNiOYDIqS15b872RunzYeTzderOcuMzU/zO6+vyIi13w1QTSbuLCRgQDhmHG5/cf+nvkVJeTdtNGAOMu52NBxgN9zAndYZOrjlYvGI1WsyTyR+Mdi//ZE715cxoTSQXZxruajzZ5VTXb2sFN6xYMmLQM37nGSJ29uc45q6qUtJs2Cyj/mYe2GSn/F5ZMv1lWSNpNlFixYCqa6t/wcTJSW2DYQDdYRCD85uUn+I+igSmNLa04W6tgbpUX9l8yg6+SHne1j0q/TtrHXkRJ/d13/FyNfLwCzkeT9hENVimYSwVZRuI/DPRxyr9bSdrHXgeY4s8+vN2IZsBUk7SPCLA+wUTcumIk1MM3+zfY/N6ZlAlKOm0kCOisQwEarXXHQ7MywRy7kWTkiP7auDAa2ZE4oP83En/Dfv9Gq9aMNQkmLPUi39o/6HOOpFwk7SDlHgW1VUY2kSfu22C9mrEawfyUksinFjDFP5eXTtpBym+oa2v5YCPvvRq7vX5WGqvWOgRjRC1/XDozs5LutEgRuVIxZs96Ps2MD/KzxvGzFQgmOj35QSf4PPKVVfPKG+tIO0jhBQy9pvAfh3U8usfqNCN1wSTkpj3KE4Tur2sW2N7JC9sDSGL+kV18mvE8EUzaQWFIWjBpFcV8dzD+ttaBvhNkLQDNgM6ETzO7EuNIOygA6QoG9B5gfgIt4ldXz69tbSbtIEUAQDOzDgVAaxPMTq3oWIZEBdOmkP9zPfw2+Z9XzqVqsUaAZvjmM2DUnVJyh7SDJiFFwYCStdvrBy3Z572m36mtIu0gxUw0Ws2IXd58q51WsX4jRcHw3W8B85n03ho/zmaQKRWD/T2h9fuW7yLpH2uSnGAibl2BluaDTuMSctNIe0dBQLO8fSDPvYxvD/iT9q4HpCWYoroavvcYDidfIO0dBRkFtVXPeEyBVnRQ0mnS3hlDQoJRqlV8hylWRoeS9o6CmKSCbOh+9KMudrfLi0h7x4uEBONyfC9ULSMDva33rB7FCIeun4fW+Cur5rUp5KS9gyMVwcRn3eArO7KvRlKwwncIYMaP20i7BkcSgqluaXzeazq31P7g+g0NYWHbqDWaQRsXQzVzNPUSae8gSEIwX+9aCy2yUDrR7wWUN9Y9Bbtw9qT7t+BLSto7Q8gLhm8gOz1kK2nXKCLBNyAfscubtGuGEBZMQ3srdB35TytmS3baR8GBQ9huqxiYERbM+CDIEZj7HcZcKcwh6xhFZDpUSuitZjBak9SxdJKCiclIgX5UFoXvI+gVhRTgKwm9VzsleDNp136FmGDAFwX6BOlAHyelmoar7KWsiA6FfkMvF2aTdu0exASzLOoQt1zucxhtLce8KTgA38q/eztwG8br3o4qjZq0dyxkBFPeWPcI7OLxgrBAIv5QpMOF/AxoJ7PjQixp11jICOab/Ru4JdJ/yYx2RQcRfyiS4jtYyNmnF0+WwtOzBAQDBl3QT8ixG0niO0ORIHVtLdCtTPeIA6RdIyGYjzd7cctisL+n1UXcoeAj4Hw0t5E87Dy+sK6arGNiC+Zs7m3oXP9GaYHInlCkjEargc7+wWiNrGOiCgb0IR9tgnQvkyR/z44iPtHpydym8qDTuKK6GoJeiSoYaBE84DiWeD9LkJqWJlAsWxIiXcP3zwndYbfXb8aP2xyP7ll/6nho8oWc6vLe/Don9PY/2ZP/ogoGeqESNA4xfZACcqUi4taVKcGbByybBV3/6G6Pu9oPDVi5/UJMRVM9acfF5nJhNrdAfuc4prShlpRL4gkmMT+Tm/nfL5wgqZNCuLlTW/X9kUAjz6cZMTDTA8o5lXWjV62OQMMyEdyvE08wX25fJc2FQnEAI2/7/RuNvAZluv3Ld2F81g3SGRKJG6UF3BJ4yHlcHaE9GZEEk1VVys32Iy52ErwhhByVRu0Tf5QvpLrZNi7I1yoi31nOV7CX5UGREnFGJMFAnwudf2SXOKkTpKC26m2/RWil0mVPun8rtesiOLh4BzKY7+cxlcib8mIIpra1+bGFE7kj8gJbD/p66U7aE27mTFcE2fLIg6Qzip33N7hzM77/8hnxPRFDMJsTTkJHFCIkTQZNM9ORF35l/8POY3GrRW/T93tq2m8z6hqGsc016LDUi9xcv7fBXXxPsAtGq9W+AYsLmlQglRsOyFDXMfI0puUXpjnm6MVt9zuMFkctepsc5KprimZa4pn2a4yyjNHZVCQ3tUbz8oo53FxnVJaI7Al2wZzJucXNJ5AQ7nTFQytjOnKY1nNAJ3o7m7rnQScEq2FC7fsQry4fmJZTjOwmo7adrRvf0+HcLM88JPYmJnbBTD64iZvP3ZficacrBqpq9nPe1UY7rbw07Bl3wwmbaBZ8brOBP6ySFQWMzuovsda1tXBDyz7uai8XN+A/XsG0KeTc6T74m9YOa44IA0Y7ymKmNcGwaTbHaBqjPvOfT0otnWU7Lr8glOsYO1STZ7CdoTUDvUYl8q0QvIIBmeHmUFIxDYQBvtMd2UzraUiL7DT/aN5XtkWz99Z/p22M5vOQkaUyGvLXsMwDGjVl7J71YvqAVzCjAn24ObTKZ15YqeSw32m+htgcU1F69H8WjicuGGBBZzYa8ZO19hRG20q6TAUDpv7ckMIPOI5tkYvXc2IUTLO8nXtxH2TYykLx69RMR76RXqXL5gXDH9YS317wtJfVnuzRYUZ+i9G0kS5fYUBfY/7x2jnRHMAomJBr57h5s7KYY6oy/TJxj1ZSfITIyhifbY5Zb4rbTHMsO7fRSSIgiylcL87jZlbMiLIYBQN92BVkGF+KKNE0MW1JprU51jzCVhAXSXd7aem3xmYyhksCZxil1bySwL0T8aiLnWiBhXEJRqFS/X7hBIOMvbh0FqbkUAI+t/J006UCTNUQ9awH9iMwQu2XlN2CcsF+IDRWMLEBgxRuZsNvXhYndVyCgd7ddzoWhCk5ZKirTRyDdTfQNInLg2uz9i8WmhF2hNaRzegkfb7mUkEWN7Ozxbrrj0sw7hEHuLk6nX0TU3II0CnZJVfBLYy1uQelMt3vbk+6TWAPy5iRo9bzjEa61y40Wg33xYeXls8WJ3VcguG+K/3YwolEzmObhMqcjqXLBq6BPJ8mBcvOP2R2pqTc1UwL2cLNbG5NhQhJYxFMdUsjNz+jd6/DkZbFaBj5bfNbVXNMe+2J+xzIawNqBxI2WZI1pvWCNHc5oRvi285FiZA0FsFA87NVlPwIQ9MMPeEiyK6k7ycuDD5zPrzUwtwxLXHsOSCJUdXcwM2sOBdGsAhmQVggNz/Z1WU40jIf0A7AHNfC9tQcE3phK3Fh8NmIAEfLM8hae7LU9mq4Y/5+HlNFCEmFRTDcCzAgMxKKdaJTMbJkJC1JXXxsqT/kto9E7O9u9h03gtFoBnTFmgbSNfcr0I9yTnU57nTRC6ZZ3n4f5+6UhCYwYFBu8TBM1xTdenJL0Rj7tCffmfnJZ8SFwWcvTh2e9sTbuW8Nq9uyXFP5s8WyiWUURaTr7x5HUy9x87s36TTudNELBrpMvvFMBPKEzEFdY/wApSkmv7b/zudjQEPU24QvPicuDD57fvrwLj+zXvmkYZ8Pgq5GngH6aNIVyZQ21HLz6xC2G3e66AWz4ZcIbk4S8zORJySYjjzLm0ut/7L0fu91tUJg0z6Vbg/Tf9rw7q4CK54wWVN63NJyaLvMbluR5oUlhqv5gzYuxp0oesFAb/mQvjGmNXtTssu0NSdKJk8zaH/A5n30KXFh8Nkr337FdThn4BcdyQcs1UzrWUZL+KTz17vWGuT3QadxuF/2Qy+Yv601fKXglVXzkKciAPAtbLtkYfvQlIXfGTKW2/iArfnXx8SFwWcfjP0S6nPGgMGyCwJPmkEsnlETi3EMWB51mJvl9IpirIkiFoxCpeJGQ52w7we0qQhA2949PIWZfUvtyYKv7KAtD9i+Vz8gLgw+sxs6hM/tzJc/7ri+32LNxLIRaggRcesKN8uHky9gTRSxYApqq7h5WH/qONpUTEXTyLT0fPHLuOmaokunzeBrdsAS+71LXBh8tuTdfxvxPPu1z1S5P1msmRh2ckiCoroabpbXxR/DmihiwZxMu8bNA5lwpuq7THOc5a3hrp+XkTanNzC3Jq4NqIW+PMi45/mfjNLeNeFuZo8mTxe/hsF05SFnwzgyYAqNNVHEgtl4JoJbbQT2+FXlSHbx2xMC0556t0fBjPzPEOLa4Nojc0fc6NuD58CqFjshEExzZ3gN0Q9r/mOdi0Gu3/JdhDVFxILhPhgNpjQiR45iFIVIWoCm8ufsv37WY4MDtuGNj4jLg2ufjxxqivPAWiO3otFM+1X2MKuIjAvyNcj1YwsnYk0RsWC4LxM87zUdbRI90JGPpu6bYypcFpjY4K4+/c6jc0YQV4iB/fDGRyb6nzPwC23NCTTlxm7RiHfqDHr7Eut1ZcSCeW3N9wbef7zZC20SxkCxNam3jpQDaX3fMbHBARszTFqjsse/G5H8pKnOA6vxNuN6Jp9mLommmV2Jcdy83ywrxJciYsFwH6Oz378RbRK8oFMLsMKvJ5je2oCF/WlQn+9HEtdJl8341KTBZJelPz9ImXUYnWaSxAlOG5V+nZv32IwUfCmiFEyHSsn1fuFxUeIqyTMQqqXlxBZBrU1vn48YSlwnevv9nBGJ/XpeqzCwstnfISxD9p4zfs0kl+Rzs3/gCsZ3Y1AKpqT+Ltd7MY5dduSgrOnmmDufjjZDMBED3v/dfEl0MgsGf2qG/2lPv6tI+xFlSeIfm5U31nGz73c6HF+KKAUDlXsI7qiE6Gb5emuL325Oa+s0+yHkTy6/MG349afM9L/CaT7awuwcm2HUjFKt4pYA1kENSsHEZaZyvY/BOaBkH3JAW8HNMewtF3MFc+Xpd16a8hVBtdw/f+S+Vz8w2//0Z99XFx1FrZnLWN9F476BMTd0J77kUArm+E3IVf5LBVkIk/gNiiLkalFmHBK0OMa1n14e9PBcYgMzB/MGY93srq8X8lLt3J/BdYWm/5IZBoWA9XI/SsEEXoznViGu06OqCvT12hxTvcLVwgYHbPVbHxNZMftk1NCbJmztG7ecf36Jo2DZcwB4eHW14YM8/9mxGlNaDFrBbDoLefy1pP4uwiTuwZ4TQ3DyhWs5b5q6O27cXD74RGS1vDlhmNlTFwOTXQrCohn2qiZ6/rne8HTMYH9PHAnpQSkY6CuE9W2oA1upGy2/Zgw1+eW9SBqc3pZMNhxb47MPPCZfe8qikWR3q/JywSIYYB25iBsDwwB52JRgmuXtCJNgo2W3nMJUnVVLXBAKpjVy694z/g84Yn9L2W6XS3tleNYrn6DyPOeNL3AJBhjqZwK4gnnbD+P5S5SC8ToZglcw2g72Ziy2usz7cASqNpf34df6uMaX0/Y9hy2w//0Oo30jffQJ1Xh7IFS74nYItnKOZUfU6OAKZiDON7pRCsbzRDBewQh8hUKQqQvCLFwf625NIb5dv7muMtx+9yLkanlt5dQr6b9emdSUHs8YMBiV/3XbVmLsZFoTkDUJqxbM0shDeAWjUzOtiZhqsTF4PbruZYSuMcrg98cnB/7DeyYSqTztPsEv0kdRH2mQxN11nqiyUDR2Ei61gPmnpglZk7BqwYgxh8E2Kqtw/h5Va2uNgl8v0TZGhycFDPKdbbZU+nvZrzvp3VQND8mnrYrI+oul+zB6y/y/f5v5VEYPhng8xsAE8+4PbmiT6A52wdS2NiNMgkUrs+RpCj7LH4xmAlM0xr7HtHLvHF56bNW/fEztcMAsaMY+d9BH9diIGw+sQyV7LNMYFfq7t1a8SrYlIZJb2UV1NQiTuAfo05GuLOvqItOffR9BO3vqXUGhWPp72psimPRcU89E6hqi8j74Golgmn76AbFaFAXoWwLDvLnO2VoFs+fSKUhlY9rp19SzLzEgqkv51X1IGlmlu7D78QOWTEIrGGCy87vTnkSwelG1BOlujBxX6NM/r5xrUFxf7VyDKS0GrWB+hsWJOp+HLZ6IqhrVfn/zkQ2Wt7DsgUO01RHEBQOswgnBfKzEfioytchu4WoDDPO8l2HAWLu9fviSQymY+Kwb3MqOTk9GmIQhqiokmqlZ4255C2uLDRCaLibBgNk/UK+F2cl9+z+I1HIDYwNgGG7gyPlHduFLDqVgUkrucCsb6/U3FhSnMMvmzraweZUvmGdGupgEAwyo18JtpfTnBqFQSyrWUP8KFeQ+jGv4fnwpohRMRVM913tfnNff7mHxOf9iu28t/BiDj7qkBAOsytPZwq+A0BGmoeE81a+nuB4S/NL/7Al8KaIUDPT6m/OxIIRJ8GJZLLL8T0aZ3aoy+n/QkXrQvHSxCkbXEFUwbLwlglGmW/AIc/sVrPfG9FwvzuMWV/BVlCcJDEAcNYb7gLp4kciVpWbPZyw51d8Uav7yK1bBAFPdCct+TVj4mO4mS9xjrlqSRVALwxOP/HT2TXwpIhbM370N37p4f4M72iSMwUaINaeCM809hVXl4Wz+Nxi/YIDJLuw2eAHKdGv/Zae5ahHpibJt56IgxYXzxQvEghkZ6G3g/bOeU9Em0QOqMjPq2Lxdy8IRE8GwR+KCAdawZ615gmmJ2Cw4OZl4agG4HN/LLS4ZztDEiAUz76edBt7f5zAaa+hOCKoqoXuaZjSmnIFfqEuOWdKORRMMsArH+WIIht1vEfX5S+4Huq/bJKwpIhYMtIvMqCxBm0rPqOvY97GwCSb9uUHyq/ssbMRiCkZbe5LvBTVkgunAFu2En9e9HQ3KCvczl4gFE5ORwq3vQ9fPo03FJDTNpp/RTH9G2Ci/6bCf5WoRUzCMWQsAAgSD55yYcaDP3U0J3ow1UcSCgT4GvTr2CNpUTEUrY+8qmVDfGS9+aHozEnpgTCKCYTqPmQn6NLTFbzfh18YyynIi1ZtXU8Etqx9++RlroogFo9KouYHVRu9ehzYVAbAvwib1WOvZr5t6kKTw6wkWTvQJCgZYw24BCwDt5wJ7+IUtp9jRLyHCUi9yy+rYjSSsiaJ/RZn7KNT/Lv8OeSpC0DKyFOMVn//RSFMaUPbAIepiSyf6ZAUDrHzBPBMFo7hl9EoM+/J4K8F6XRxxkFtWOdV4uzv0ggGDSG420AdbEoo800jdF46c2GPrYSf6VxBM9IkLhl0A+HyMKYIxtgzYmshoxX1YjsPQgJUGBfWIi51Gi/cJNPSC2X4hhlvlZ3NvI09IMOxRAPhyc/m8OT22nqZDaCb6xAUDTJV/pMfLzBn9P+D9DewBZFGf5oPyjMcUg4L6dMtS3ImiFwz0eI933FHkCZkDu3R2htsCalb3cLy/0t0RuVoICgYYmJ8YXwDIfWsY/P8qML7vZTrQGf+icOyPEaEXTLui4wHHsQY5wRruVhi6Dvbdkt82AuMhYwqHo5zoS0QwDLsAsMZIriGBY9gpPoYL52YRcu0ct6BE2MBALxjAO36uBjl53NVeqxX7TWpedFqDEGfyJN4gsexEH/kLENIQDLDy7+fyZdzwmBw7aUEaAMgyZh0K4BZUYV017nSxCMY94gA3MzdKCextGQN8LP8bdVZT+TP0Hjw70b+8F1NjlYJg2AWAz+ALAA1B3r/+ZEemyGdeeoT7/PCAZbNESBeLYCLTIE91Yn1IzUy0sq7hWd6g4ZCJfrcAljYpGEa/APAqZAHg3iUf8E1RVZGuJ0Og++OTDviLkDQWwTTK2u53MDyzMDRgJY60LAUMz9jnl2PL5hjeUq50wzLRl5pggLUnGC4ApD8/iI2B1n6N0Yl7cNY0gq8mcEtpb9JpEZLGIhjAexvcDfLzkPM4sY8tm46mueHAxt9M9L+ywzTRl6BggNUH/mYBgA1HiDrMPkLs9vpxSwnLS0QccAlmRXQoN0snbl/FlJzlKEvKfp3ovz5EXYhroi9NwTC/3Yy6u1mUi+VmodKoH3c1DIAIpjTipI5LMJcLs7kV/93h7ZiSQ0LOm6PuTfSTME70JSuY7gsAslQsr4Uh4WzubW4ROYkTOgKfYNQaDfcz8IzHFAktLnOo8GRHZY1HY9mnzNGF1bQWwTCyFFVledZfvsx6bZhOJ601se7MCd3BLaJYrI91dwOXYADTQ7ZyM3YOXyBMi2m7mFLpteneH7Rypj21twim9XzXoeP2a7crFosVt0Q44IPbz2OqQfk84TZJqVaJ4wBGwYTfvMyte/B5wJeihejUap3mt0ekVLVM6wVbFkzraUZZZLDHolWK1PjMICE3jVs+3+zfIJoDGAUjVyq4o7KnF09WqKRbH3CUZUzrOZsTTDwjz2J0VlYXsw9v55ZPxK0rojmAUTCAifs2cLMXmXYda6J40DHKYujBTesTDJieyTOIH843gw6Vsq+bYYk96mInxxkmxgC8gonLTOVW/5g967EmihMtoyhhR/xWKpiWU0xHNjs9s06gVyynhWwR0we8ggGjLzAGM8jhg07j0D9LJjKqKqbtsjUJpuUso7gjhUsslvDVzjXcwonPwvs6gAF4BcPAIpUB2/BLBO50xUDTwkbi4rmUJhXBAGGrq6V2dNIMShtq73MYbVAy/TymqjRqMd3ALhjofbKXV8yR8kq/MMC8WVlqXoeDUTCtZ5mOXEbbRrp0kOF1MoRbMguPY78xZgB2wQAGbVzMzWqMWDtN4qGVscMeIQ+joxdMyxn2qo+6nnRZIAZM65/znMYtmeJ6sS+0iSEY6NuXw7avEiFpMuiUbJ8jS2V3OcQQTCwbSqojn2wMF6xAm5AIN/i5iCGYNoWcO/XvgznKulQAgyJlESO7ybRBeh7zBQNGXO3J7KCL7UxsZXDLD/dViD7ibr90IYZgGJ4o69+KcuNHQujU7IPpqgq2obMSujxgCeQ7AhFMfgQbWk2eyXZc6jpr3EKxhOj0ZG6Z/GnFbNwRlaCIJJjCumrulbIHHMeKcAlbypQ21IISYK22grW7pYW1xYW1Jff+qP+numrRDkpJk8H+nlzBbDsXRcQZkQTD8Fz6mS3tA/8U4pzLS+c2m8cWTmySkVkAFE8wN8sKuTkHnUxBreSujFOkw4f+Htxm43EimJQ/4gkGMGz7KjqToZgOdPbysPP46pZGUi6JKphLBVnc/N/nMDqtNyyXUQSi1WrfXOfMbTDib1Z2R1TBAEbsMnxjDdhXO9eI7AZF+vwIi20JZi93W5sIeiW2YFJL70BXTqV8E5MiPkq1asCyWdx24h5xgKxjYgsGMGbPem5BvOHjpNZY91laCkLWxoVxG0lft0k1LSS7F4aIYPJqKrhPEwLblRgnvjMUCVJSf/dRFztuC1kXf4y0ayQEA1gQFsgtjifcJtURf3eJIgFGBfpwm8cfl84U82YlH2QE0yhre4Jz17SPWOFxKVIGGpgb2JGUi6RdYyEjGEDA+WhouZwS9wIdRVK0dshfXAqZ63+0yUsiF6iICUaj1XCfj+3T+WgBKDVSXlHIMjcUcj/3focxGZUlpF27BzHBAK4V5XIvnQKbHrKVoFcUUkBDpgBzDd9P2rVfISkYhmf238daQzFRzAdMa19YMp3bEl5aPltSjz4QFgwYfUH3p55ePJnshi4mCmqr5oTuMDCHsN1BSae7dhgS8zO5P9Nla+PCyGYBE+ODIIfZgZ3Ovknatd9AWDCAmIwUaEkN37lGIvM8tGRXl/1l9XyQwT+4ftMka7tUkKWfyz3iYqd/nD3wYjwYtQdfTQAS6mpG4CfTKooH+jgBI50D9EBPwQCbGryZtGuGkBcMYOahbdDy2nT2JGnXsDC8M77W4672+j+eybmlz+8XASuYTsHMOhSg/6dJB/z1/6T/Y051+ZvrnIn4jA/wBeGGFNYv/7TIZaS9M0QSggEDM/1H18AedBoHPsCkvUOPgWBulBbo8/v1rrVMZwOqbGrQ/5OBYJjOC1XiO4yPdkXHq7CqB33seUnmVBKCAaSU3OHeYe7Tub/b1XpsBgPB+J4O1zcRMHsx+EmuYGyMkYGQ0+t9iF4RM45UBANYCXvlD9hgf08bu9SuF8xDzuNAs7Db63efw+hh21fdKi/k/qRtC0b/peDauz+4SbbGJSQYjVYzZNsKaAlK/K0/oegF89jCiX7/bTFg9gJ9m82GBXMy7Rq0rp9ePLm0oZa0d7xISDCA2tZm6CozMPA1Iu0dMroPyaaFbNFn0O1nyE0PWxVMekUxdKIPOlsgJNLeGUNaggEkFWSDuT5UM4eTL5D2Dg3dBSNXKgb6OOkzeOxGksFP2qRgyhvrwNQUWsXE74f1iOQEA9iVGActTSCkhNw00t4hYGjASv0cRj9Sz6oqfdh5fJ/Ot4EuF2Z3/8muF6nqbeXiQ7O8vesDYWBgIkckNp8gpCgYwMLj+6BlCsb914vzSHtnPgW1VaMCfbpO0P1jnYt+mbhrMgNU5BC2W/+T44J8u27agZGqDVywkykV0Mj0wICKJLjrwkWiglFp1J9tXQYt2Wc8ptyhocysENCdGqlTawlPJ1HBMEb77uc8p+XVVJB2kCIAoJb/7FjNN9K+UphD2kFTka5gGKOzwxeXzsqlmrESgFrA8BJaj/c7jJH4spgBkhYM07n+CPprvn4GTJdJO0jpAaCWr3ethdZgHyuMfCJ1wTCd98ygMUT6dG5y9YpHZqwWMMv/ZMtSPrX4WeHemhUIBnA+L51PM33dJtnGWrPtUdfWwrcmBmxROMmIr2ZjHYJhOq9V/X7hBGjRP+Q8LixVEiFFKF0U1dW8tuZ7PrVAjzVYBVYjGMDFO5mPLZzIVwfrTx0n7SDlHlcKc/p5TOWrqcURB0k7aD7WJBimM/7//yzi1cz0kK2SPeXaeziSclF/cAFqnlI9t28iViYYpvOwGfSJWb0N9vckHn6316LVar1OhvBVDbDVsUdI+2gp1icYQGZlaf8lM/hqZcCyWUBUpH3sddS2NkPfMumy3ZfiSfuIAKsUDKCyqeFvayFPUevtAcex285F2WQMDWlyvTjvpeWz+arjURc7m4mbZa2CAbQp5J9vXW7kkzZ2z3qbOeQrWcBXaUtCJPhC8dXCc57TkkvySbuJDCsWDNN5SfO7w9uNaObFpbOkGUvBNqhuafwS9m5plw30cSquryHtJkqsWzB6dibGQh+c6TLnY0EyCbyUYGMcTb30FP/qC7BRgT5SeKACLbYgGKZziwYaaLTLXl4xB/wMaTdtBNCxQJ+R6zLw/fI7HW6Tc0gbEQygpqXJ+JTmPofR3x8JbJS1kfbUitFqtSHXzhlZ1tdPWmx4GGw7gmE6pzRrYo9A45t1WV+3SXuTTtvkxw83N8sK3/ZbZKRsgQ0NWFnb2kzaU4zYlGD0nMtLhz7K090+2uRlS0s3uLnb2jTvp53GJ4rgX9fFH4MGi7IlbFAwgCZZ2/SQrcY1A0Zo3x7wl3IILCnQoVL6ng6Hvq/Y3V73dgT9D2lnxcA2BaMn4taVZz15jwDq7UGncU7HgsAslrSzkkOpVgVejO+xrwbfHc8Twe2KDtL+ioQtCwZQ39bSFSnPiD3sPN41fD99w1mPWqMB0zy+iIrd7Q0fp17SsXRh44LRcz4v3cg5mi571MXO+VhQSf1d0v4SQ65U7EqMM3LIpcseWzhxc8JJIC3SLotNrxAM09kUVsceeYTn2qbB5HVkoLdBQD2bp7Kpwe3nA317mqvobeye9Ta2f286vUUwesAUf0rwZuhLtFx7c50zGJlI6oFF5Oh0uoTcNCAAI4fButu/fBfa8B6LKfQuwegBw26+iHJce8Jt0sxD264W5ZL2GjHljXXecUdfWTXPxHIAU5qfUhJtftW4R/4fKi24rW4tZ94AAAAASUVORK5CYII=";
//#endregion
//#region src/assets/bulletin_csj.png?inline
var bulletin_csj_default = "data:image/png;base64,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";
//#endregion
//#region src/lib/bulletinPdf.ts
var PAGE_W = 595.28;
var PAGE_H = 841.89;
var MARRON = [
	128,
	0,
	32
];
var OR = [
	253,
	224,
	71
];
var TITLE_BG = [
	255,
	251,
	227
];
var GOLD_TEXT = [
	69,
	26,
	3
];
var SLATE = [
	51,
	65,
	85
];
var LABEL = [
	100,
	116,
	139
];
var VALUE = [
	15,
	23,
	42
];
var ROW_TEXT = [
	30,
	27,
	75
];
var INFO_BG = [
	250,
	250,
	250
];
var GRID = [
	241,
	245,
	249
];
var ROW_ROSE = [
	255,
	241,
	242
];
var MUTED = [
	148,
	163,
	184
];
var BORDER = [
	226,
	232,
	240
];
var BADGE_ROSE = [
	254,
	226,
	226
];
/** Carte blanche posée sur le fond gris de la page. */
var CARD = {
	top: 18,
	bottom: 824
};
var CENTER_X = 297.8;
/** En-tête : logos + 5 lignes centrées. */
var HEAD_STATE = {
	x: 45.7,
	y: 57,
	w: 58,
	h: 52
};
var HEAD_CSJ = {
	x: 488,
	y: 56,
	w: 58,
	h: 55
};
var HEAD_BASELINES = [
	70.3,
	78.6,
	91.3,
	100.3,
	115.7
];
/** Filet bordeaux + encadré titre. */
var TITLE_RULE = {
	y: 123.6,
	x0: 45.7,
	x1: 549.9,
	h: 1.5
};
var TITLE_BOX = {
	x0: 45.7,
	x1: 549.9,
	top: 131.1,
	bottom: 167.1,
	bar: 3.75
};
var TITLE_BASELINE = 148.2;
var SUBTITLE_BASELINE = 158.6;
/** Bloc élève (2 × 2). */
var INFO_BOX = {
	x0: 45.7,
	x1: 549.9,
	top: 176,
	bottom: 230.7,
	midY: 194
};
var INFO_VX = [
	136.7,
	298.2,
	388.8
];
var INFO_BASELINES = [186.4, 205.2];
var INFO_COLS = {
	labelL: 52.8,
	valueL: 143.3,
	labelR: 304.2,
	valueR: 394.6
};
/** Tableau des matières : en-tête bordeaux + colonnes (relevé du gabarit). */
var TABLE = {
	x0: 46.4,
	x1: 549.2,
	headTop: 240.5,
	headBottom: 258.4,
	headBaseline: 250.2,
	firstRowTop: 258.4,
	rowH: 18.73,
	totalH: 17.2,
	minRowH: 14
};
/** [gauche, droite] de chaque colonne (9 colonnes). */
var COLS = [
	[46.4, 170.1],
	[170.1, 202.3],
	[202.3, 242.7],
	[242.7, 283.2],
	[283.2, 322.9],
	[322.9, 370.1],
	[370.1, 415.1],
	[415.1, 445],
	[445, 549.2]
];
var COL_HEADERS = [
	"MATIÈRES",
	"COEFF",
	"INTERRO",
	"DEVOIR",
	"COMPO",
	"MOYENNE",
	"TOTAL",
	"RANG",
	"APPRÉCIATION"
];
var HEAD_CELL_BASELINE = 250.2;
var ROW_TEXT_BASELINE_DY = 12.3;
/** Encadrés synthèse (gauche) et discipline (droite). */
var BOTTOM_BOX_TOP = 525.5;
var SYNTH = {
	x0: 45.7,
	x1: 295,
	titleBaseline: 537.8
};
var DISCIPLINE = {
	x0: 300,
	x1: 549.9,
	titleBaseline: 537.8
};
var SYNTH_BASELINES = [
	560.4,
	579.1,
	594.1,
	608.3
];
var DISC_BASELINES = [
	557.5,
	571.7,
	585.9,
	600.2
];
/** Appréciation globale. */
var APPR_BOX = {
	x0: 45.7,
	x1: 549.9,
	top: 628,
	bottom: 682
};
var APPR_TITLE_BASELINE = 642.9;
var APPR_MENTION_BASELINE = 654.4;
var APPR_TEXT_BASELINE = 666.6;
/** Trois encadrés de signature. */
var SIG_BOXES = {
	top: 688.8,
	bottom: 744.2,
	titleBaseline: 701.2,
	placeholderBaseline: 736,
	boxes: [
		{
			x0: 46.4,
			x1: 200.8
		},
		{
			x0: 220,
			x1: 374.4
		},
		{
			x0: 393.7,
			x1: 549.5
		}
	]
};
/** WinAnsi : supprime les caractères non encodables par les polices standard. */
var winAnsi = (s) => s.replace(/[‘’‚]/g, "'").replace(/[“”„]/g, "\"").replace(/[–—]/g, "-").replace(/•/g, "-").replace(/…/g, "...").replace(/[^ -ÿ]/g, "");
/** Réduit le corps (par pas de 0,25 pt) jusqu'à faire tenir `text` dans `maxW`. */
var fitSize = (doc, text, maxW, base, min) => {
	for (let s = base; s > min; s -= .25) {
		doc.setFontSize(s);
		if (doc.getTextWidth(text) <= maxW) return s;
	}
	doc.setFontSize(min);
	return min;
};
/** Coupe avec « ... » quand même la taille minimale ne tient pas. */
var truncate = (doc, text, maxW) => {
	if (doc.getTextWidth(text) <= maxW) return text;
	let lo = 0;
	let hi = text.length;
	while (lo < hi) {
		const mid = Math.ceil((lo + hi) / 2);
		if (doc.getTextWidth(`${text.slice(0, mid)}...`) <= maxW) lo = mid;
		else hi = mid - 1;
	}
	return lo > 0 ? `${text.slice(0, lo).trimEnd()}...` : "";
};
/** Texte centré. */
var centered = (doc, text, cx, baseline) => {
	doc.text(text, cx, baseline, { align: "center" });
};
/** Nombre /20 formaté « 12.44 » (zero-pad sous 10, comme le gabarit) — null → « -- ». */
var fmt = (v, empty = "--") => {
	if (v === null || Number.isNaN(v)) return empty;
	const str = v.toFixed(2);
	return v < 10 ? `0${str}` : str;
};
/** Somme des coefficients affichée sans décimale inutile. */
var fmtCoeff = (v) => Number.isInteger(v) ? String(v) : v.toFixed(2);
/**
* Appréciation automatique selon la moyenne (barème du bulletin) :
* < 10 Insuffisant · 10–11,99 Passable · 12–13,99 Assez bien · 14–15,99 Bien ·
* 16–17,99 Très bien · 18–20 Excellent. La moyenne est arrondie à 2 décimales
* avant classement pour rester cohérente avec l'affichage.
*/
var appreciationFor = (v) => {
	if (v === null || Number.isNaN(v)) return "Insuffisant";
	const r = Math.round(v * 100) / 100;
	if (r >= 18) return "Excellent";
	if (r >= 16) return "Très bien";
	if (r >= 14) return "Bien";
	if (r >= 12) return "Assez bien";
	if (r >= 10) return "Passable";
	return "Insuffisant";
};
/** Note absente → 0 (règle du bulletin). */
var nz = (v) => v === null || Number.isNaN(v) ? 0 : v;
/** Moyenne d'une matière : (interro + devoir + compo) ÷ 3, note absente = 0. */
var subjectAverage = (s) => (nz(s.interro) + nz(s.devoir) + nz(s.compo)) / 3;
/**
* Totaux du tableau : total des (moyenne matière × coef) et somme des coefs.
* La moyenne trimestrielle affichée = total général ÷ somme des coefs.
*/
var computeTotals = (subjects) => {
	let totalGeneral = 0;
	let totalCoefs = 0;
	for (const s of subjects) {
		totalGeneral += subjectAverage(s) * s.coefficient;
		totalCoefs += s.coefficient;
	}
	return {
		totalGeneral,
		totalCoefs
	};
};
/** Pose une image en gardant son ratio dans le cadre ; jamais d'erreur fatale. */
var addImageSafe = (doc, dataUrl, x, y, w, h) => {
	if (!dataUrl) return false;
	try {
		const props = doc.getImageProperties(dataUrl);
		const ratio = Math.min(w / props.width, h / props.height);
		const finalW = props.width * ratio;
		const finalH = props.height * ratio;
		doc.addImage(dataUrl, props.fileType || "PNG", x + (w - finalW) / 2, y + (h - finalH) / 2, finalW, finalH, void 0, "FAST");
		return true;
	} catch {
		return false;
	}
};
/** « 10 » + « e » en exposant (comme le gabarit). */
var drawOrdinal = (doc, value, cx, baseline) => {
	const main = doc.getTextWidth(value);
	const eSize = 7.07;
	doc.setFontSize(eSize);
	const x0 = cx - (main + doc.getTextWidth("e")) / 2;
	doc.setFontSize(8.49);
	doc.text(value, x0, baseline);
	doc.setFontSize(eSize);
	doc.text("e", x0 + main, baseline - 2.5);
};
var drawHeader = (doc, bulletin, school) => {
	addImageSafe(doc, bulletin_state_default, HEAD_STATE.x, HEAD_STATE.y, HEAD_STATE.w, HEAD_STATE.h);
	addImageSafe(doc, bulletin_csj_default, HEAD_CSJ.x, HEAD_CSJ.y, HEAD_CSJ.w, HEAD_CSJ.h);
	doc.setFont("times", "bold");
	doc.setFontSize(9.99);
	doc.setTextColor(...MARRON);
	centered(doc, winAnsi("RÉPUBLIQUE TOGOLAISE"), CENTER_X, HEAD_BASELINES[0]);
	doc.setFont("times", "italic");
	doc.setFontSize(7.99);
	doc.setTextColor(180, 83, 9);
	centered(doc, winAnsi("Travail - Liberté - Patrie"), CENTER_X, HEAD_BASELINES[1]);
	doc.setFont("times", "normal");
	doc.setTextColor(...SLATE);
	const ministry = school.ministry_name?.trim() ? school.ministry_name.split("\n").map((l) => l.trim()).filter(Boolean) : ["Ministère de l'Enseignement Primaire, Secondaire et de l'Artisanat", "Direction Régionale de l’Éducation (DRE-Maritime)"];
	doc.setFontSize(7.49);
	fitSize(doc, winAnsi(ministry[0] ?? ""), 240, 7.49, 6);
	centered(doc, winAnsi(ministry[0] ?? ""), CENTER_X, HEAD_BASELINES[2]);
	const second = ministry[1] ?? "Direction Régionale de l’Éducation (DRE-Maritime)";
	fitSize(doc, winAnsi(second), 240, 7.49, 6);
	centered(doc, winAnsi(second), CENTER_X, HEAD_BASELINES[3]);
	doc.setFont("times", "bold");
	doc.setFontSize(10.98);
	doc.setTextColor(...MARRON);
	centered(doc, winAnsi((school.name || "ORION COLLEGE EXPERIENCE").toUpperCase()), CENTER_X, HEAD_BASELINES[4]);
	doc.setFillColor(...MARRON);
	doc.rect(TITLE_RULE.x0, TITLE_RULE.y, TITLE_RULE.x1 - TITLE_RULE.x0, TITLE_RULE.h, "F");
	doc.setFillColor(...TITLE_BG);
	doc.rect(TITLE_BOX.x0, TITLE_BOX.top, TITLE_BOX.x1 - TITLE_BOX.x0, TITLE_BOX.bottom - TITLE_BOX.top, "F");
	doc.setFillColor(...OR);
	doc.rect(TITLE_BOX.x0, TITLE_BOX.top, TITLE_BOX.x1 - TITLE_BOX.x0, .75, "F");
	doc.rect(TITLE_BOX.x0, TITLE_BOX.bottom - .75, TITLE_BOX.x1 - TITLE_BOX.x0, .75, "F");
	doc.setFillColor(...MARRON);
	doc.rect(TITLE_BOX.x0, TITLE_BOX.top, TITLE_BOX.bar, TITLE_BOX.bottom - TITLE_BOX.top, "F");
	doc.rect(TITLE_BOX.x1 - TITLE_BOX.bar, TITLE_BOX.top, TITLE_BOX.bar, TITLE_BOX.bottom - TITLE_BOX.top, "F");
	const periodLabel = [
		"PREMIER",
		"DEUXIÈME",
		"TROISIÈME"
	][Math.min(Math.max(bulletin.periodOrder, 1), 3) - 1];
	doc.setFont("times", "bold");
	doc.setFontSize(12.98);
	doc.setTextColor(...MARRON);
	const title = winAnsi(`BULLETIN DU ${periodLabel} TRIMESTRE`);
	fitSize(doc, title, 340, 12.98, 9);
	centered(doc, title, CENTER_X, TITLE_BASELINE);
	doc.setFont("times", "normal");
	doc.setFontSize(8.49);
	doc.setTextColor(...GOLD_TEXT);
	centered(doc, winAnsi(`ANNÉE SCOLAIRE : ${bulletin.yearName.replace(/-/g, " - ")}`), CENTER_X, SUBTITLE_BASELINE);
};
var drawInfoBox = (doc, bulletin) => {
	doc.setFillColor(...INFO_BG);
	doc.rect(INFO_BOX.x0, INFO_BOX.top, INFO_BOX.x1 - INFO_BOX.x0, INFO_BOX.bottom - INFO_BOX.top, "F");
	doc.setFillColor(...GRID);
	doc.rect(INFO_BOX.x0, INFO_BOX.midY, INFO_BOX.x1 - INFO_BOX.x0, .75, "F");
	INFO_VX.forEach((x) => doc.rect(x - .375, INFO_BOX.top, .75, INFO_BOX.bottom - INFO_BOX.top, "F"));
	const [l1, l2] = INFO_BASELINES;
	const label = (text, x, baseline) => {
		doc.setFont("helvetica", "bold");
		doc.setFontSize(8.49);
		doc.setTextColor(...LABEL);
		doc.text(winAnsi(text), x, baseline);
	};
	const value = (text, x, baseline, maxW) => {
		doc.setFont("helvetica", "normal");
		doc.setFontSize(8.49);
		doc.setTextColor(...VALUE);
		doc.text(truncate(doc, winAnsi(text), maxW), x, baseline);
	};
	const fullName = [bulletin.studentLastName, bulletin.studentFirstName].filter(Boolean).join(" ").trim() || "—";
	label("Nom & Prénoms :", INFO_COLS.labelL, l1);
	value(fullName, INFO_COLS.valueL, l1, 155);
	label("Matricule :", INFO_COLS.labelR, l1);
	value(bulletin.matricule ?? "—", INFO_COLS.valueR, l1, 150);
	label("Classe :", INFO_COLS.labelL, l2);
	value(bulletin.className ?? "—", INFO_COLS.valueL, l2, 155);
	label("Effectif :", INFO_COLS.labelR, l2);
	value(`${bulletin.classSize} Élèves`, INFO_COLS.valueR, l2, 150);
};
var drawTable = (doc, bulletin) => {
	const { subjects } = bulletin;
	const count = Math.max(subjects.length, 1);
	const available = 525 - TABLE.firstRowTop - TABLE.totalH - 6;
	const rowH = Math.min(TABLE.rowH, available / count);
	const totalTop = TABLE.firstRowTop + count * rowH;
	doc.setFillColor(...MARRON);
	doc.rect(TABLE.x0, TABLE.headTop, TABLE.x1 - TABLE.x0, TABLE.headBottom - TABLE.headTop, "F");
	doc.setFont("helvetica", "bold");
	doc.setFontSize(7.49);
	doc.setTextColor(255, 255, 255);
	COL_HEADERS.forEach((h, i) => {
		const [x0, x1] = COLS[i];
		centered(doc, h, (x0 + x1) / 2, HEAD_CELL_BASELINE);
	});
	subjects.forEach((s, i) => {
		const top = TABLE.firstRowTop + i * rowH;
		if (i % 2 === 1) {
			doc.setFillColor(...ROW_ROSE);
			doc.rect(TABLE.x0, top, TABLE.x1 - TABLE.x0, rowH, "F");
		}
		const baseline = top + ROW_TEXT_BASELINE_DY * (rowH / TABLE.rowH);
		doc.setFontSize(8.49);
		doc.setTextColor(...ROW_TEXT);
		doc.setFont("helvetica", "bold");
		const name = winAnsi(s.name);
		fitSize(doc, name, COLS[0][1] - COLS[0][0] - 10, 8.49, 6.5);
		doc.text(truncate(doc, name, COLS[0][1] - COLS[0][0] - 10), COLS[0][0] + 5, baseline);
		const cell = (text, col, bold = false) => {
			doc.setFont("helvetica", bold ? "bold" : "normal");
			doc.setFontSize(8.49);
			const [x0, x1] = COLS[col];
			const cx = (x0 + x1) / 2;
			doc.text(text, cx, baseline, { align: "center" });
		};
		cell(fmtCoeff(s.coefficient), 1, true);
		cell(fmt(nz(s.interro)), 2);
		cell(fmt(nz(s.devoir)), 3);
		cell(fmt(nz(s.compo)), 4);
		cell(fmt(subjectAverage(s)), 5, true);
		cell(fmt(subjectAverage(s) * s.coefficient), 6);
		if (s.rank !== null) {
			doc.setFont("helvetica", "normal");
			doc.setFontSize(8.49);
			doc.setTextColor(...ROW_TEXT);
			drawOrdinal(doc, String(s.rank), (COLS[7][0] + COLS[7][1]) / 2, baseline);
		} else cell("--", 7);
		doc.setFont("helvetica", "normal");
		doc.setFontSize(8.49);
		const appr = winAnsi(appreciationFor(subjectAverage(s)));
		fitSize(doc, appr, COLS[8][1] - COLS[8][0] - 8, 8.49, 6);
		centered(doc, truncate(doc, appr, COLS[8][1] - COLS[8][0] - 8), (COLS[8][0] + COLS[8][1]) / 2, baseline);
	});
	doc.setFillColor(...MARRON);
	doc.rect(TABLE.x0, totalTop, TABLE.x1 - TABLE.x0, TABLE.totalH, "F");
	doc.setTextColor(255, 255, 255);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(8.99);
	const tb = totalTop + TABLE.totalH * .62;
	doc.text("TOTAL GÉNÉRAL", COLS[0][0] + 5, tb);
	const totalCell = (text, col) => {
		const [x0, x1] = COLS[col];
		doc.text(text, (x0 + x1) / 2, tb, { align: "center" });
	};
	const coeffSum = subjects.reduce((sum, s) => sum + s.coefficient, 0);
	const { totalGeneral } = computeTotals(subjects);
	totalCell(fmtCoeff(coeffSum), 1);
	totalCell("—", 2);
	totalCell("—", 3);
	totalCell("—", 4);
	totalCell("—", 5);
	totalCell(fmt(totalGeneral), 6);
	totalCell("—", 7);
	totalCell("—", 8);
};
/** Encadré à coins arrondis (bordure fine, fond blanc). */
var roundedBox = (doc, x0, top, x1, bottom) => {
	doc.setDrawColor(...BORDER);
	doc.setLineWidth(.75);
	doc.setFillColor(255, 255, 255);
	doc.roundedRect(x0, top, x1 - x0, bottom - top, 4, 4, "FD");
};
var drawBottomBoxes = (doc, bulletin) => {
	const bottom = 618;
	roundedBox(doc, SYNTH.x0, BOTTOM_BOX_TOP, SYNTH.x1, bottom);
	roundedBox(doc, DISCIPLINE.x0, BOTTOM_BOX_TOP, DISCIPLINE.x1, bottom);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(7.99);
	doc.setTextColor(...MARRON);
	doc.text("SYNTHÈSE DES RÉSULTATS", SYNTH.x0 + 7.1, SYNTH.titleBaseline);
	const label = (text, x, baseline) => {
		doc.setFont("helvetica", "normal");
		doc.setFontSize(8.49);
		doc.setTextColor(...ROW_TEXT);
		doc.text(winAnsi(text), x, baseline);
	};
	label("Moyenne Trimestrielle :", SYNTH.x0 + 7.1, SYNTH_BASELINES[0]);
	const { totalGeneral, totalCoefs } = computeTotals(bulletin.subjects);
	const avgText = fmt(totalCoefs > 0 ? totalGeneral / totalCoefs : null);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(10.98);
	const avgW = doc.getTextWidth(avgText);
	doc.setFillColor(...BADGE_ROSE);
	doc.roundedRect(287 - avgW - 10, SYNTH_BASELINES[0] - 9.5, avgW + 14, 13, 3, 3, "F");
	doc.setTextColor(...MARRON);
	doc.text(avgText, 287 - avgW - 3, SYNTH_BASELINES[0] - .5);
	label("Rang de l'élève :", SYNTH.x0 + 7.1, SYNTH_BASELINES[1]);
	if (bulletin.rank !== null) {
		doc.setFont("helvetica", "bold");
		doc.setFontSize(8.49);
		doc.setTextColor(...ROW_TEXT);
		drawOrdinal(doc, String(bulletin.rank), 280, SYNTH_BASELINES[1]);
	}
	label("Moyenne de la Classe :", SYNTH.x0 + 7.1, SYNTH_BASELINES[2]);
	doc.setFont("helvetica", "normal");
	doc.setFontSize(8.49);
	doc.setTextColor(...ROW_TEXT);
	const classAvg = bulletin.classAverage !== null ? `${fmt(bulletin.classAverage)} / 20` : "--";
	doc.text(classAvg, 287 - doc.getTextWidth(classAvg), SYNTH_BASELINES[2]);
	label("Plus Forte / Faible Moy. :", SYNTH.x0 + 7.1, SYNTH_BASELINES[3]);
	const extremes = `${fmt(bulletin.bestAverage)}    |    ${fmt(bulletin.worstAverage)}`;
	doc.text(extremes, 287 - doc.getTextWidth(extremes), SYNTH_BASELINES[3]);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(7.99);
	doc.setTextColor(...MARRON);
	doc.text("DISCIPLINE & ASSIDUITÉ", DISCIPLINE.x0 + 9, DISCIPLINE.titleBaseline);
	[
		["Absences Non Justifiées :", "—"],
		["Nombre de Retards :", "—"],
		["Avertissement Discipline :", "Aucun"],
		["Tenue & Conduite :", "—"]
	].forEach(([l, v], i) => {
		label(l, DISCIPLINE.x0 + 9, DISC_BASELINES[i]);
		doc.setFont("helvetica", "bold");
		doc.setFontSize(8.49);
		doc.setTextColor(...ROW_TEXT);
		doc.text(v, 542.8 - doc.getTextWidth(v), DISC_BASELINES[i]);
	});
};
var drawAppreciation = (doc, bulletin) => {
	roundedBox(doc, APPR_BOX.x0, APPR_BOX.top, APPR_BOX.x1, APPR_BOX.bottom);
	doc.setFont("helvetica", "bold");
	doc.setFontSize(7.99);
	doc.setTextColor(...MARRON);
	doc.text("APPRÉCIATION GLOBALE & MENTIONS DU CONSEIL :", APPR_BOX.x0 + 10.8, APPR_TITLE_BASELINE);
	const { totalGeneral, totalCoefs } = computeTotals(bulletin.subjects);
	const avg = totalCoefs > 0 ? totalGeneral / totalCoefs : null;
	const mention = bulletin.rank !== null && bulletin.rank <= 3 ? "honor" : avg !== null && avg >= 10 ? "encouragement" : "warning";
	const boxes = [
		{
			key: "honor",
			text: "[  ] Tableau d'Honneur"
		},
		{
			key: "encouragement",
			text: "[  ] Encouragements"
		},
		{
			key: "warning",
			text: "[   ] Mise en Garde"
		}
	];
	let mx = APPR_BOX.x0 + 10.8;
	boxes.forEach(({ key, text }) => {
		const finalText = key === mention ? text.replace("[  ]", "[X]").replace("[   ]", "[X]") : text;
		doc.setFont("helvetica", "bold");
		doc.setFontSize(7.99);
		doc.setTextColor(...MARRON);
		doc.text(finalText, mx, APPR_MENTION_BASELINE);
		mx += doc.getTextWidth(finalText) + 12;
	});
	const text = winAnsi(bulletin.globalAppreciation.trim() || appreciationFor(avg));
	doc.setFont("helvetica", "italic");
	doc.setFontSize(8.49);
	doc.setTextColor(...SLATE);
	const maxW = APPR_BOX.x1 - APPR_BOX.x0 - 21.6;
	const lines = doc.splitTextToSize(`« ${text} »`, maxW);
	doc.text(lines.slice(0, 2), APPR_BOX.x0 + 10.8, APPR_TEXT_BASELINE);
};
var drawSignatures = (doc, bulletin, school) => {
	const titles = [
		"Le Titulaire",
		"Le Parent / Tuteur",
		"Le Directeur / Principal"
	];
	const placeholders = [
		bulletin.homeroomTeacher?.trim() || "—",
		"Signature & Date",
		"[ Cachet & Signature ]"
	];
	SIG_BOXES.boxes.forEach((box, i) => {
		doc.setDrawColor(...BORDER);
		doc.setLineWidth(.75);
		doc.setFillColor(255, 255, 255);
		doc.roundedRect(box.x0, SIG_BOXES.top, box.x1 - box.x0, SIG_BOXES.bottom - SIG_BOXES.top, 4, 4, "FD");
		doc.setFont("helvetica", "bold");
		doc.setFontSize(8.49);
		doc.setTextColor(...SLATE);
		centered(doc, titles[i], (box.x0 + box.x1) / 2, SIG_BOXES.titleBaseline);
		doc.setFont("helvetica", "normal");
		doc.setFontSize(7.99);
		if (i === 2 && school.signature_url) addImageSafe(doc, school.signature_url, box.x0 + 10, SIG_BOXES.top + 30, box.x1 - box.x0 - 20, 40);
		else {
			doc.setTextColor(...MUTED);
			centered(doc, placeholders[i], (box.x0 + box.x1) / 2, SIG_BOXES.placeholderBaseline);
		}
	});
};
/** Construit le PDF du bulletin (une page A4 portrait). */
function buildBulletinPdf(opts) {
	const doc = new jsPDF({
		unit: "pt",
		format: [PAGE_W, PAGE_H],
		orientation: "portrait"
	});
	doc.setFillColor(...GRID);
	doc.rect(0, 0, PAGE_W, PAGE_H, "F");
	doc.setFillColor(255, 255, 255);
	doc.rect(0, CARD.top, PAGE_W, CARD.bottom - CARD.top, "F");
	drawHeader(doc, opts.bulletin, opts.school);
	drawInfoBox(doc, opts.bulletin);
	drawTable(doc, opts.bulletin);
	drawBottomBoxes(doc, opts.bulletin);
	drawAppreciation(doc, opts.bulletin);
	drawSignatures(doc, opts.bulletin, opts.school);
	return doc;
}
/** Nom de fichier : un bulletin → nom de l'élève ; sinon export groupé. */
function bulletinFileName(bulletins, yearName) {
	const sanitize = (s) => s.replace(/[^a-zA-Z0-9 -]/g, "_").replace(/\s+/g, "_").slice(0, 40);
	const periodLabel = [
		"T1",
		"T2",
		"T3"
	][(bulletins[0]?.periodOrder ?? 1) - 1] ?? "T1";
	if (bulletins.length === 1) {
		const b = bulletins[0];
		return `Bulletin_${sanitize([b.studentLastName, b.studentFirstName].filter(Boolean).join(" ").trim() || "eleve")}_${periodLabel}.pdf`;
	}
	return `Bulletins_Eleves_${periodLabel}_${yearName.replace(/[^a-zA-Z0-9-]/g, "_") || "annee"}.pdf`;
}
//#endregion
//#region smoke/run_bulletin.ts
var school = {
	name: "ORION COLLEGE EXPERIENCE",
	short_name: "ORION",
	ministry_name: "Ministère de l'Enseignement Primaire, Secondaire et de l'Artisanat\nDirection Régionale de l'Éducation (DRE-Maritime)",
	address: "",
	city: "Lomé",
	country: "Togo",
	phone: "",
	email: "",
	website: "",
	registration_number: "",
	logo_url: "",
	stamp_url: "",
	signature_url: "",
	head_title: "Directeur",
	head_name: "",
	slogan: "",
	currency: "XOF"
};
var subjects = [
	{
		name: "Français / Littérature",
		coefficient: 4,
		interro: 14.5,
		devoir: 13,
		compo: 15,
		average: 14.13,
		rank: 4,
		appreciation: "Excellent"
	},
	{
		name: "Anglais",
		coefficient: 3,
		interro: 15,
		devoir: 14,
		compo: 16,
		average: 15,
		rank: 2,
		appreciation: "Excellent"
	},
	{
		name: "Allemand",
		coefficient: 3,
		interro: 12,
		devoir: 13.5,
		compo: 13,
		average: 12.88,
		rank: 8,
		appreciation: "Bien"
	},
	{
		name: "Histoire - Géographie",
		coefficient: 3,
		interro: 11,
		devoir: 12,
		compo: 11.5,
		average: 11.5,
		rank: 15,
		appreciation: "Assez Bien"
	},
	{
		name: "ECM / Philosophie",
		coefficient: 2,
		interro: 13,
		devoir: 12.5,
		compo: 14,
		average: 13.13,
		rank: 6,
		appreciation: "Bien"
	},
	{
		name: "Mathématiques",
		coefficient: 2,
		interro: 8,
		devoir: 9.5,
		compo: 7,
		average: 8.13,
		rank: 35,
		appreciation: "Insuffisant"
	},
	{
		name: "Sciences Physiques (PCT)",
		coefficient: 2,
		interro: 9,
		devoir: 10,
		compo: 8.5,
		average: 9.13,
		rank: 30,
		appreciation: "Passable"
	},
	{
		name: "SVT",
		coefficient: 2,
		interro: 10.5,
		devoir: 11,
		compo: 12,
		average: 11.25,
		rank: 18,
		appreciation: "Assez Bien"
	},
	{
		name: "EPS",
		coefficient: 1,
		interro: 16,
		devoir: 15,
		compo: 16,
		average: 15.67,
		rank: 3,
		appreciation: "Excellent"
	},
	{
		name: "Informatique / TIC",
		coefficient: 1,
		interro: 15,
		devoir: 14,
		compo: 16,
		average: 15,
		rank: 5,
		appreciation: "Excellent"
	},
	{
		name: "Économie / Entrepreneuriat",
		coefficient: 1,
		interro: 12,
		devoir: 11,
		compo: 13,
		average: 12,
		rank: 14,
		appreciation: "Bien"
	},
	{
		name: "Éducation Musicale / Arts",
		coefficient: 1,
		interro: 14,
		devoir: 15,
		compo: 14,
		average: 14.33,
		rank: 6,
		appreciation: "Bien"
	},
	{
		name: "Matière Optionnelle / Autre",
		coefficient: 1,
		interro: null,
		devoir: null,
		compo: null,
		average: null,
		rank: null,
		appreciation: ""
	}
];
var bulletin = {
	studentFirstName: "Latevi Jean",
	studentLastName: "LAWSON-BODY",
	matricule: "2025-CSJ-089",
	className: "1ère A4 (Littéraire)",
	periodOrder: 1,
	yearName: "2025-2026",
	subjects,
	generalAverage: subjects.reduce((sum, s) => sum + ((s.interro ?? 0) + (s.devoir ?? 0) + (s.compo ?? 0)) / 3 * s.coefficient, 0) / subjects.reduce((sum, s) => sum + s.coefficient, 0),
	rank: 10,
	classSize: 42,
	classAverage: 11.05,
	bestAverage: 16.8,
	worstAverage: 6.15,
	globalAppreciation: "Élève sérieux, discipliné et très performant dans les disciplines littéraires et langues. Consolidez les matières scientifiques au prochain trimestre pour élever encore davantage votre moyenne générale.",
	homeroomTeacher: "Mme DOSSEH K."
};
console.log(`Moyenne générale (règle) : ${bulletin.generalAverage?.toFixed(4)}`);
var doc = buildBulletinPdf({
	bulletin,
	school
});
var outPath = resolve(process.cwd(), "smoke/bulletin_out.pdf");
writeFileSync(outPath, Buffer.from(doc.output("arraybuffer")));
console.log(`OK ${outPath} — nom : ${bulletinFileName([bulletin], "2025-2026")}`);
var emptyDoc = buildBulletinPdf({
	bulletin: {
		...bulletin,
		studentFirstName: "Ama",
		studentLastName: "KOSSI",
		matricule: null,
		subjects: subjects.slice(0, 3).map((s) => ({
			...s,
			interro: null,
			devoir: null,
			compo: null,
			average: null,
			rank: null,
			appreciation: ""
		})),
		generalAverage: null,
		rank: null,
		classAverage: null,
		bestAverage: null,
		worstAverage: null,
		globalAppreciation: ""
	},
	school
});
var emptyPath = resolve(process.cwd(), "smoke/bulletin_out_empty.pdf");
writeFileSync(emptyPath, Buffer.from(emptyDoc.output("arraybuffer")));
console.log(`OK ${emptyPath}`);
//#endregion
export {};
