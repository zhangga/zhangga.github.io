---
title: Debugging Remotely with Go in Kubernetes[zz]
date: 2024-01-18 11:45:12
tags:
  - go
id: debug-remote-go-k8s
categories:
  - 笔记
---

zz: https://alexsniffin.medium.com/debugging-remotely-in-kubernetes-with-go-fda4f3332316

Proper testing can be difficult and even seem impossible. Following best practices to test your code is a good start, but you’re still going to run into edge cases where things aren’t as expected. One challenge in particular, is being able to accurately simulate your deployments remote environment.

Figuring out the inconsistencies to why your program works on your local machine but not on another machine can be painstakingly frustrating. Maybe it’s the version of your compiler, your operating system, configuration, or certain dependencies that were missed— etcetera-etcetera.

This has been a common problem with software development and why the rise of [virtualization and containerization have become so popular, especially in cloud-based applications](https://www.ibm.com/topics/containerization). Even so, things can still go wrong with your VM’s and containers.

Let’s take a look into how debugging your application’s runtime in it’s deployed environment can help you quickly find the root cause to what isn’t working as expected. For this example we’ll use Go to write the application and deploy it to Kubernetes in a Docker container.

# Example Code

Lets create a simple API that can calculate a value in the Fibonacci sequence that we want to be able to debug. I’ll be using [Chi](https://github.com/go-chi/chi) as the router and then use the [stdlib](https://pkg.go.dev/net/http@go1.19.3) to run the server. I’ve tried to keep the example simple, you can checkout the [repo](https://github.com/alexsniffin/go-blog3-example) to see all of the code.

Let’s first create a handler that takes a query parameter of n and calls the Fibonacci function.

<iframe src="https://alexsniffin.medium.com/media/ab6e886ad4073a10f0ee293e70940f46" allowfullscreen="" frameborder="0" height="307" width="680" title="Blog3Example1_1.go" class="fp n gf dv bg" scrolling="no" style="box-sizing: inherit; top: 0px; width: 680px; height: 307px; position: absolute; left: 0px;"></iframe>

Then for the Fibonacci function, I wrote the [memoized](https://www.geeksforgeeks.org/what-is-memoization-a-complete-tutorial/) implementation.

<iframe src="https://alexsniffin.medium.com/media/8a2375ee5e2710f323efc71d9763427b" allowfullscreen="" frameborder="0" height="329" width="680" title="Blog3Example1_1.go" class="fp n gf dv bg" scrolling="no" style="box-sizing: inherit; top: 0px; width: 680px; height: 329px; position: absolute; left: 0px;"></iframe>

# Remote Debugging

To debug the container we’ll need to set up remote debugging, to do this, we can use the popular Go debugger [Delve](https://github.com/derekparker/delve). Delve supports attaching to a process and will allow us to introspect our application in the runtime. To debug, Delve is supported in a few IDE’s and editors including [GoLand](https://blog.jetbrains.com/go/2019/02/06/debugging-with-goland-getting-started/) and [VS Code](https://code.visualstudio.com/docs/languages/go#_debugging). For this example I’ll be using GoLand.

We’ll need a Dockerfile which has the Delve binary in it which we’ll be able to remotely execute the application binary. The command I’ll be using is:

```
dlv --listen=:40000 --headless=true --api-version=2 --log exec ./example
```

Where the listening port is 40,000 and it points to the example binary. The complete Dockerfile downloads Delve, builds the app, and starts the Delve process.

<iframe src="https://alexsniffin.medium.com/media/55081a02d05948e449d3bc87c0d1541c" allowfullscreen="" frameborder="0" height="637" width="680" title="Blog3Example1_3.debug.Dockerfile" class="fp n gf dv bg" scrolling="no" style="box-sizing: inherit; top: 0px; width: 680px; height: 637px; position: absolute; left: 0px;"></iframe>

When running the container, we want to make sure we set the binded ports to map with what we’re using for the example app and Delve. The following build and run commands will work for this example.

```
docker build -t go-blog3-example -f .\debug.Dockerfile .
docker run -p 8080:8080 -p 40000:40000 --name example go-blog3-example:latest
```

Similarly, we can use the interface in GoLand to do this too.

![docker in goland](https://miro.medium.com/v2/resize:fit:700/1*LRql3LDD2wVDg1jgLz3V_g.png)

Now for the fun part, lets remotely connect! In GoLand we can do this by creating a new Run configuration with the Go Remote option.

![run configuration for go remote](https://miro.medium.com/v2/resize:fit:211/1*ElWmHRQ1vlOoZ_IVnUDi_Q.png)

Then using the following settings.

![go remote settings](https://miro.medium.com/v2/resize:fit:700/1*_xrt7a_nDH0kZQ3bfahoeQ.png)

With the container running, we should be able to remotely start the debugging session.

![debug window](https://miro.medium.com/v2/resize:fit:588/1*BV7-2OOWvPpwgN8i55LYyA.png)

Awesome! That’s it but now lets see how we can utilize this through Kubernetes with a pod to debug the container in the same environment that it normally runs in.

# Debugging the Pod

Lets say we currently already have the container running normally as a Deployment and it’s currently receiving traffic. We’ve noticed that there’s odd behavior happening and we can’t accurately replicate what’s happening locally. For this, we’ll want to stand up a new pod along side our current deployment and start debugging.

To do this, we can add the new container as a standalone pod from the normal deployment. If you have additional resources that you’ll need, you’ll want to be sure to include them too. You can do that with kubectl apply, your Kubernetes package manager or CD tool.

```
> kubectl run example --image=asniffin/go-blog3-example:latest --namespace=blog
pod/example created
```

We should be able to check the state of the pod and see it’s running.

```
> kubectl describe pod example --namespace=blog
...
Conditions:
  Type              Status
  Initialized       True
  Ready             True
  ContainersReady   True
  PodScheduled      True
...
```

Then checking the logs, we can see that it’s listening for a connection.

```
> kubectl logs example --namespace=blog
API server listening at: [::]:40000
2022-11-23T18:37:00Z warning layer=rpc Listening for remote connections (connections are not authenticated nor encrypted)
2022-11-23T18:37:00Z info layer=debugger launching process with args: [./example]
```

Now to debug from our local machine, we need to tunnel to the pod with the correct ports and protocol. To do this, we can use the port-forward kubectl command provided our pod and ports.

```
> kubectl port-forward pods/example 8080:8080 40000:40000 --namespace=blog
Forwarding from 127.0.0.1:8080 -> 8080
Forwarding from [::1]:8080 -> 8080
Forwarding from 127.0.0.1:40000 -> 40000
Forwarding from [::1]:40000 -> 40000
```

Now when running the remote debugger we should be able to connect and start debugging! Let’s try with sending a request to the fib endpoint.

```
> curl http://localhost:8080/fib?n=10
55
```

![debug window from kubernetes](https://miro.medium.com/v2/resize:fit:621/1*YngWz7M0Y419StR8H2G9nQ.png)

Nice 😎! We can see that we’re able to both debug and send requests to the pod. With this, we can accurately debug the container and pod in the same environment where it’s deployed and with all of it’s remote resources. Remember to remove your pod when you’ve finished!

```
> kubectl delete pod example --namespace=blog
pod "example" deleted
```

# Conclusion

Debugging is an effective tool that every developer should keep on their tool belt. When it’s difficult to simulate your applications environment, being able to accurately pinpoint the root cause to a problem can prove to be difficult. Remotely debugging your application lets you quickly introspect the runtime and observe the behavior of your application.

Thanks for reading!

*Disclaimer: Doing this in production should be done with caution, probably best left in a development or QA environment!*
